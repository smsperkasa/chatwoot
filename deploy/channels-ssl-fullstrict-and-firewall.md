# Runbook: `channels.smsperkasa.com` Full (Strict)-ready + droplet firewall

- **Droplet:** `167.71.206.23` (self-hosted Chatwoot, the live customer chat)
- **Date:** 2026-06-04
- **Companion handoff:** `docs/superpowers/handoffs/2026-06-04-channels-fullstrict-origin.md`
- **Execution model:** you run on the droplet, step by step. Every step has a verify + rollback.
- **Downtime budget:** Part A recreates **only** the `nginx-chatwoot` container (~1–3 s blip; Cloudflare
  retries, so most users see nothing). Rails / Sidekiq / Postgres / Redis are **never touched**. Part B
  Phase 1 is zero-impact; Part B Phase 2 is zero-impact *iff* `FRONTEND_URL` is the Cloudflare hostname.

> The repo changes (cert path + bind mount) are already committed on branch
> `hotfix/fix-ssl-certificate-configuration`. This runbook deploys them.

---

## Discovery findings (already verified — 2026-06-04)

- Origin `167.71.206.23:443` currently serves a **self-signed, expired (2023-01-24)** cert whose SAN is
  only `dev.smsperkasa.com`. Tolerated under Cloudflare "Full"; would return **526** under Full (Strict).
- The origin is **directly reachable on the public internet** on `:443` (not locked to Cloudflare) and on
  `:5432` (Postgres, but already app-level allow-listed to Airbyte + staging in `nginx_postgres/nginx.conf`).
- Only two host ports are published by Docker: **443** (nginx-chatwoot) and **5432** (nginx-postgres),
  plus host **SSH 22**. Redis/Rails/Postgres-direct are inter-container only.
- **Docker bypasses `ufw`** for published ports → we use a **DigitalOcean Cloud Firewall** (network edge).

---

# Part A — Swap the origin cert (Option A2: reuse the Cloudflare Origin wildcard)

### A0. Pre-flight: confirm the cert you placed is good (read-only)

```bash
# Issuer should be "CloudFlare Origin SSL Certificate Authority" (or a public CA),
# notAfter far in the future, SAN covering *.smsperkasa.com or channels.smsperkasa.com:
sudo openssl x509 -in /etc/ssl/cloudflare/smsperkasa.com.pem -noout -issuer -subject -dates -ext subjectAltName

# Key MUST match cert — the two md5 hashes must be identical:
sudo sh -c 'openssl x509 -noout -modulus -in /etc/ssl/cloudflare/smsperkasa.com.pem | openssl md5; \
            openssl rsa  -noout -modulus -in /etc/ssl/cloudflare/smsperkasa.com.key | openssl md5'

# Permissions sane:
sudo chmod 644 /etc/ssl/cloudflare/*.pem && sudo chmod 600 /etc/ssl/cloudflare/*.key
sudo chown root:root /etc/ssl/cloudflare/*
```

**STOP if** the issuer is self-signed/`O=SMSP`, the cert is expired, the SAN doesn't cover the host, or the
two md5 hashes differ. Do not proceed — fix the cert first.

### A1. Pull the branch on the droplet

```bash
cd <chatwoot dir>            # the directory where you run docker-compose
git fetch origin
git checkout hotfix/fix-ssl-certificate-configuration
git pull --ff-only
git --no-pager diff HEAD~1 -- nginx/ssl-smsperkasa.com.conf docker-compose.smsp-prod.yaml   # eyeball the change
```

### A2. Build the new nginx image — does NOT touch the running container

```bash
docker-compose -f docker-compose.yaml -f docker-compose.smsp-prod.yaml build nginx-chatwoot
```

### A3. **Pre-flight gate** — validate config + cert load in an isolated throwaway container

```bash
docker-compose -f docker-compose.yaml -f docker-compose.smsp-prod.yaml \
  run --rm --no-deps nginx-chatwoot nginx -t
```
Expect `syntax is ok` / `test is successful`. This actually opens the mounted cert at
`/etc/ssl/cloudflare/...`, so a wrong path or unreadable key fails **here**, before prod is touched.
**STOP if this fails.**

### A4. Recreate ONLY nginx-chatwoot (the ~1–3 s blip)

```bash
docker-compose -f docker-compose.yaml -f docker-compose.smsp-prod.yaml up -d nginx-chatwoot
```

### A5. Verify

```bash
# Origin now serves the Cloudflare Origin cert (issuer = CloudFlare Origin SSL CA, future expiry, good SAN):
echo | openssl s_client -connect 127.0.0.1:443 -servername channels.smsperkasa.com 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates -ext subjectAltName

# Through Cloudflare (still on "Full" pre-flip) — expect 200/302, NOT 5xx:
curl -s -o /dev/null -w "channels -> %{http_code}\n" https://channels.smsperkasa.com/

# Live chat: open https://www.smsperkasa.com/ and confirm the widget loads + connects (WebSocket).
docker logs --tail=50 nginx-chatwoot
```

### A-Rollback (if anything looks wrong)

```bash
git checkout HEAD~1 -- nginx/ssl-smsperkasa.com.conf docker-compose.smsp-prod.yaml
docker-compose -f docker-compose.yaml -f docker-compose.smsp-prod.yaml build nginx-chatwoot
docker-compose -f docker-compose.yaml -f docker-compose.smsp-prod.yaml up -d nginx-chatwoot
```
Chat returns to its prior (Full-tolerated) state in seconds.

> **NOTE:** This runbook does **not** flip the Cloudflare zone to Full (Strict). Per the handoff, the flip
> happens only after **both** `channels` and `cpanel-blog` are ready — coordinate separately.

---

# Part B — DigitalOcean Cloud Firewall (phased, reversible)

**Why DO Cloud Firewall, not ufw:** Docker publishes 443/5432 by writing its own iptables rules that
bypass `ufw`'s INPUT chain — `ufw` would give false security. The DO firewall filters at the network edge
*before* the droplet, is unaffected by Docker, and **detaches instantly** from the DO panel if needed.

### ⚠️ The one footgun: OUTBOUND
A DO firewall created via API/`doctl` with **no outbound rules blocks ALL outbound traffic** — which would
break Chatwoot's calls to Meta Graph API, SMTP, package mirrors, etc. The commands below **explicitly add
outbound allow-all**. Do not omit them. (The web dashboard pre-fills outbound allow-all for you.)

### B0. Get the droplet ID (doctl path)

```bash
doctl auth init     # paste a DO API token with read+write, if not already authenticated
doctl compute droplet list --format ID,Name,PublicIPv4 | grep 167.71.206.23
```

### B1. Phase 1 — attach a permissive-but-scoped firewall (ZERO downtime)

22 open (key-only auth is the boundary), 443 open to all (unchanged for live traffic), 5432 locked to
Airbyte + staging, **outbound allow-all**. Attaching this is a no-op for your published services.

```bash
doctl compute firewall create \
  --name chatwoot-channels-167-71-206-23 \
  --droplet-ids <DROPLET_ID> \
  --inbound-rules "protocol:tcp,ports:22,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:5432,address:178.128.120.55,address:165.232.175.107" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0 protocol:icmp,address:0.0.0.0/0,address:::/0"
```

**Dashboard equivalent:** Networking → Firewalls → Create. Inbound: SSH 22 `All IPv4/All IPv6`;
Custom TCP 443 `All IPv4/All IPv6`; Custom TCP 5432 sources `178.128.120.55` and `165.232.175.107`.
Leave Outbound at the default (all). Apply to droplet `167.71.206.23`.

**Verify Phase 1 (from your laptop + the box):**
```bash
curl -s -o /dev/null -w "channels -> %{http_code}\n" https://channels.smsperkasa.com/   # still 200
ssh <user>@167.71.206.23 'echo ssh-ok'                                                  # SSH still works
# From the Airbyte box (178.128.120.55) confirm 5432 reachable; from any other host it should now time out.
```
Also confirm the channels still flow: send a test WhatsApp / Messenger / IG message and a website-chat
message; confirm they land in Chatwoot. Watch for ~10–15 min.

### B2. Phase 2 — tighten 443 to Cloudflare only (the real hardening)

**Precondition — verify webhooks arrive via Cloudflare, not the raw IP:**
```bash
grep -E '^FRONTEND_URL' .env     # must be https://channels.smsperkasa.com  (NOT the bare IP)
```
If `FRONTEND_URL` is the Cloudflare hostname, all Meta webhook callbacks + the livechat use Cloudflare, so
restricting origin 443 to Cloudflare IPs is safe and closes the direct-origin bypass. **If it's the raw IP,
do NOT do Phase 2** — fix the callback URLs first, or leave 443 open.

**Dashboard (recommended — least error-prone):** edit the firewall's inbound **443** rule, replace
`All IPv4 / All IPv6` in *Sources* with the Cloudflare ranges below, save.

**doctl alternative** — remove the open 443 rule, add the Cloudflare-scoped one:
```bash
FW=<FIREWALL_ID>   # doctl compute firewall list

doctl compute firewall remove-rules $FW \
  --inbound-rules "protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0"

doctl compute firewall add-rules $FW \
  --inbound-rules "protocol:tcp,ports:443,address:173.245.48.0/20,address:103.21.244.0/22,address:103.22.200.0/22,address:103.31.4.0/22,address:141.101.64.0/18,address:108.162.192.0/18,address:190.93.240.0/20,address:188.114.96.0/20,address:197.234.240.0/22,address:198.41.128.0/17,address:162.158.0.0/15,address:104.16.0.0/13,address:104.24.0.0/14,address:172.64.0.0/13,address:131.0.72.0/22,address:2400:cb00::/32,address:2606:4700::/32,address:2803:f800::/32,address:2405:b500::/32,address:2405:8100::/32,address:2a06:98c0::/29,address:2c0f:f248::/32"
```
> Cloudflare IP list current as of 2026-06-04; re-fetch before applying:
> `curl -s https://www.cloudflare.com/ips-v4/ ; curl -s https://www.cloudflare.com/ips-v6/`

**Verify Phase 2:**
```bash
curl -s -o /dev/null -w "via CF -> %{http_code}\n" https://channels.smsperkasa.com/   # 200 (through CF)
echo | timeout 8 openssl s_client -connect 167.71.206.23:443 2>/dev/null | head -1    # should TIME OUT now
```
Re-test all four channels (WhatsApp, Messenger, IG, livechat) again, and watch 10–15 min.

### B-Rollback
- **Anything off after attaching:** DO panel → the firewall → **Detach** from the droplet (instant), or
  `doctl compute firewall remove-droplets $FW --droplet-ids <DROPLET_ID>`.
- **Phase 2 broke a channel:** revert the 443 source back to `0.0.0.0/0` + `::/0` (re-open), then
  investigate the offending webhook's callback URL.

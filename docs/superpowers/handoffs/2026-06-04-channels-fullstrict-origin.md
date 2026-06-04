# Handoff: make `channels.smsperkasa.com` Full (Strict)-ready

- **Date:** 2026-06-04
- **Owner:** teddy@smsperkasa.com
- **Status:** ✅ ORIGIN READY — **Option A2 deployed & verified 2026-06-04.** The origin `167.71.206.23:443` now serves the Cloudflare Origin wildcard (issuer `CloudFlare Origin SSL Certificate Authority`, SAN `*.smsperkasa.com`, valid to 2041); `channels -> 200` through Cloudflare; only `nginx-chatwoot` was recreated. Deploy + firewall runbook: `deploy/channels-ssl-fullstrict-and-firewall.md`. **Zone flip still gated on `cpanel-blog.smsperkasa.com`** (separate handoff) — do NOT flip yet. Firewall (runbook Part B) not yet applied.
- **Risk level:** ⚠️ Higher — `channels.smsperkasa.com` is the **live customer chat** (Chatwoot) embedded on the website. A mistake here breaks the chat widget. Do the read-only discovery first; make no change until the current state is understood.

---

## 1. Background (read this first — self-contained)

We are hardening `smsperkasa.com`. Part of that is moving the Cloudflare zone's **SSL/TLS encryption mode from "Full" to "Full (Strict)."**

**The critical fact:** Cloudflare's SSL/TLS mode is a **zone-wide** setting. When the zone is on **Full (Strict)**, Cloudflare **validates the origin certificate** for *every* proxied (orange-cloud) hostname in the zone. If any origin presents a certificate that is **expired, self-signed/untrusted, or doesn't match the hostname**, that hostname returns **Cloudflare Error 526 (Invalid SSL certificate)**. Under plain "Full," Cloudflare encrypts to the origin but does **not** validate, so bad certs are silently tolerated — which is how this zone has run for years.

**Where the zone stands (as of 2026-06-04):**
- ✅ `smsperkasa.com` (apex) and `www.smsperkasa.com` → origin = FE droplet `188.166.248.19`, valid Cloudflare Origin cert (to 2041).
- ✅ `odoo-connector.smsperkasa.com` → origin = `209.97.173.147:3400`, fixed with a real Cloudflare Origin cert + an enabled Origin Rule.
- ⛔ `channels.smsperkasa.com` → **THIS doc** (status unknown — verify).
- ⛔ `cpanel-blog.smsperkasa.com` → separate handoff.
- Dead records already deleted from the zone: `ab`, `api`, `img`. `smsejahtera` is obsolete (points directly at `209.97.173.147`, not Cloudflare).

**The zone has NOT been flipped yet.** It is still on "Full." Do **not** flip it from this handoff. The flip happens only after **both** `channels` and `cpanel-blog` are confirmed ready (or pinned — see Option C). See "Definition of done" below.

**Full background:** `docs/superpowers/specs/2026-06-03-ssl-fullstrict-and-firewall-design.md`, plan `docs/superpowers/plans/2026-06-03-ssl-fullstrict-and-firewall.md`, runbook `deploy/firewall/README.md`.

---

## 2. Goal

Make `channels.smsperkasa.com`'s origin present a certificate Cloudflare will accept under Full (Strict) — i.e. **either**:
- a **publicly-trusted** cert (Let's Encrypt, etc.), **or**
- a **Cloudflare Origin CA** cert,

not expired, with a SAN covering `channels.smsperkasa.com`. **Or**, as a fast unblock, pin this hostname to "Full" with a Configuration Rule (Option C) and fix the cert later.

---

## 3. What we know

- `channels.smsperkasa.com` is **proxied (orange)** in the `smsperkasa.com` Cloudflare zone.
- It is **self-hosted Chatwoot** (the site's live-chat). The frontend references it via `NEXT_PUBLIC_CHATWOOT_URL=channels.smsperkasa.com`, `NEXT_PUBLIC_CHATWOOT_API_URL=https://channels.smsperkasa.com/public/api/v1/`, `NEXT_PUBLIC_CHATWOOT_APP_API_URL=https://channels.smsperkasa.com/api/v1`.
- It uses WebSockets (ActionCable) for live messaging — keep that in mind when testing.
- The reusable wildcard Cloudflare Origin cert (`*.smsperkasa.com` + `smsperkasa.com`, valid to 2041) already exists on the FE droplet at `/etc/ssl/cloudflare/smsperkasa.com.{pem,key}` — it **also covers** `channels.smsperkasa.com` if you choose to reuse it.

---

## 4. Step 0 — Discovery (read-only) — ✅ DONE 2026-06-04

**Results:**
- Origin = `167.71.206.23:443`, terminated by the Docker `nginx-chatwoot` container (image built from
  `Dockerfile_nginx`, config `nginx/nginx-app.conf` + snippet `nginx/ssl-smsperkasa.com.conf`). Cert was
  baked in from `nginx/openssl/` → `/etc/letsencrypt/live`.
- The origin cert was **self-signed** (`CN=smsperkasa.com, O=SMSP`, from local `myCA`), **expired
  2023-01-24**, **SAN = `dev.smsperkasa.com` only** → would 526 under Full (Strict). Confirmed both in-repo
  and live against `167.71.206.23:443`.
- Origin `:443` is **directly reachable from the public internet** (not Cloudflare-only) — addressed by the
  firewall Phase 2 in the runbook.
- **Decision → Option A2:** reuse the host's `/etc/ssl/cloudflare/smsperkasa.com.{pem,key}` Cloudflare
  Origin wildcard, **bind-mounted** read-only into the container (keeps the private key out of git/image).
  Repo changes on branch `hotfix/fix-ssl-certificate-configuration`:
  `nginx/ssl-smsperkasa.com.conf` (cert paths) + `docker-compose.smsp-prod.yaml` (volume). Deploy steps:
  `deploy/channels-ssl-fullstrict-and-firewall.md`.

<details><summary>Original Step-0 checklist (for reference)</summary>

- [ ] **Find the origin.** Cloudflare dashboard → `smsperkasa.com` → **DNS** → find the `channels` record → note its **content** (origin IP or CNAME target). Then **Rules → Origin Rules** — check for any port override for `channels` (if none, Cloudflare connects on `:443`).

- [ ] **Identify how the origin terminates TLS.** SSH into the origin server (the IP from above) and find what's serving `:443` (or the overridden port):
  ```bash
  sudo ss -tlnp | grep -vE '127.0.0.1|::1'         # what listens, which process
  docker ps 2>/dev/null                             # is Chatwoot/nginx/caddy in Docker?
  ```
  Common Chatwoot fronts: an `nginx` reverse proxy, a `caddy` (auto-TLS), or Docker `nginx`/`traefik`.

- [ ] **Inspect the current origin cert.** From the origin server itself (most reliable — the origin may be firewalled to Cloudflare-only):
  ```bash
  echo | openssl s_client -connect 127.0.0.1:443 -servername channels.smsperkasa.com 2>/dev/null \
    | openssl x509 -noout -issuer -subject -dates -ext subjectAltName
  ```
  (If you can reach the origin IP directly from your laptop, use `<ORIGIN_IP>:<PORT>` instead of `127.0.0.1:443`. A timeout there likely means the origin is firewalled to Cloudflare-only — good — so check from the server.)

- [ ] **Decide based on the issuer/dates/SAN:**
  - **Issuer = a public CA (e.g. `R3`/`Let's Encrypt`, `Sectigo`) OR `CloudFlare Origin SSL Certificate Authority`, not expired, SAN includes `channels.smsperkasa.com` (or `*.smsperkasa.com`)** → **ALREADY VALID.** No change needed — skip to §6 Verification and mark done. (Chatwoot fronted by Caddy or certbot often already has a valid Let's Encrypt cert.)
  - **Issuer = self-signed / `CN=smsperkasa.com` self-issued, OR expired, OR SAN doesn't cover the host** → needs fixing. Go to §5.

</details>

---

## 5. Fix options (pick ONE) — **chosen: Option A2 (reuse wildcard, bind-mounted)**

### Option A — Install a Cloudflare Origin cert at the reverse proxy (if you control the server)
Best when Chatwoot is fronted by an `nginx`/Docker reverse proxy you can edit (mirrors the odoo-connector fix).

- [ ] **Get a cert.** Either:
  - **A1 (recommended, isolated key):** Cloudflare dashboard → **SSL/TLS → Origin Server → Create Certificate** → hostnames `channels.smsperkasa.com` (or `*.smsperkasa.com`) → choose RSA/ECC → **save the certificate AND the private key** (the key is shown only once). Save as `channels.smsperkasa.com.pem` and `.key`.
  - **A2 (reuse):** copy the existing wildcard from the FE droplet:
    ```bash
    # on the channels origin server, as a path your proxy can read:
    sudo mkdir -p /etc/ssl/cloudflare
    # then scp /etc/ssl/cloudflare/smsperkasa.com.{pem,key} from 188.166.248.19 to here
    sudo chmod 600 /etc/ssl/cloudflare/*.key && sudo chmod 644 /etc/ssl/cloudflare/*.pem
    sudo chown root:root /etc/ssl/cloudflare/*
    ```
- [ ] **Verify the key matches the cert** (the two hashes must be identical):
  ```bash
  sudo sh -c 'openssl x509 -noout -modulus -in <cert>.pem | openssl md5; openssl rsa -noout -modulus -in <key>.key | openssl md5'
  ```
- [ ] **Point the proxy at it.** In the Chatwoot nginx server block for `channels.smsperkasa.com`, set:
  ```nginx
  ssl_certificate     /etc/ssl/cloudflare/channels.smsperkasa.com.pem;   # or smsperkasa.com.pem if reusing
  ssl_certificate_key /etc/ssl/cloudflare/channels.smsperkasa.com.key;
  ```
  Then `sudo nginx -t && sudo nginx -s reload` (or restart the proxy container). Keep the WebSocket/`location` config unchanged.

### Option B — Rely on / fix Let's Encrypt (if Chatwoot uses certbot or Caddy)
If discovery showed a Caddy/certbot setup whose cert just expired or doesn't cover the host:
- [ ] Renew/issue: `sudo caddy reload` (Caddy auto-renews) or `sudo certbot renew` / `sudo certbot --nginx -d channels.smsperkasa.com`. A valid public cert is accepted by Full (Strict).

### Option C — Pin `channels` to "Full" via a Cloudflare Configuration Rule (fastest unblock, no origin access)
Use this to unblock the zone flip immediately while you fix the cert later. Requires only Cloudflare (Pro plan supports Configuration Rules).
- [ ] Cloudflare dashboard → **Rules → Configuration Rules → Create rule**.
- [ ] Name: `channels.smsperkasa.com -> Full (not strict)`.
- [ ] When incoming requests match: **Hostname** `equals` `channels.smsperkasa.com`.
- [ ] Then settings: enable **SSL** → set to **Full**.
- [ ] Deploy. This overrides the zone's strict mode for this hostname only. (Revisit later to do Option A/B and remove the rule.)

---

## 6. Verification

- [ ] **Origin cert is valid** (re-run the §4 openssl check): issuer is a public CA or `CloudFlare Origin SSL Certificate Authority`, not expired, SAN covers `channels.smsperkasa.com`.
- [ ] **Through Cloudflare, still on "Full" (pre-flip):**
  ```bash
  curl -s -o /dev/null -w "channels -> %{http_code}\n" https://channels.smsperkasa.com/
  ```
  Expect a normal Chatwoot response (200/302), not 5xx.
- [ ] **Live chat still works:** open `https://www.smsperkasa.com/`, confirm the chat widget loads and can open/connect (WebSocket). 
- [ ] **(Optional strict pre-check)** If you set a Configuration Rule pinning a *test* hostname to strict, or after the global flip, confirm no `526`. The real strict test happens at the flip — see §7.

---

## 7. Definition of done & how this feeds the flip

This hostname is "ready" when **either** its origin serves a Cloudflare-valid cert (Option A/B verified) **or** it's pinned to "Full" via a Configuration Rule (Option C).

- [ ] Mark `channels.smsperkasa.com` ready.
- [ ] ⚠️ **Do NOT flip the zone here.** The flip (`smsperkasa.com` → Cloudflare → SSL/TLS → Overview → **Full (strict)**) happens only once **both** `channels` AND `cpanel-blog` are ready. Coordinate with the `cpanel-blog` handoff. After flipping, verify every proxied hostname returns non-526:
  ```bash
  for h in www.smsperkasa.com smsperkasa.com odoo-connector.smsperkasa.com channels.smsperkasa.com cpanel-blog.smsperkasa.com; do
    printf "%-34s -> %s\n" "$h" "$(curl -s -o /dev/null -w '%{http_code}' https://$h/)"
  done
  ```

---

## 8. Rollback
- **If `channels` 526s after the flip:** immediately set a Configuration Rule pinning `channels` to "Full" (Option C) — clears the 526 in seconds — then re-investigate the origin cert.
- **If a proxy reload broke chat:** revert the `ssl_certificate*` lines to the previous values and reload; the chat returns to its prior (Full-tolerated) state.
- **Whole-zone escape hatch:** Cloudflare → SSL/TLS → Overview → set back to **Full** (clears all 526s instantly).

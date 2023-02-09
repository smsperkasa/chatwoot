<template>
  <div class="main">
    <button class="button opportunity_button" @click="toggleModal">
      Create Opportunity
    </button>

    <!-- <div v-if="showError" class="popup-error"> -->
    <div v-if="showNotif" class="notif" @click="toggleError">
      <div :class="{ popup_error: isError, popup_success: isSuccess }">
        <div class="close-x" @click="toggleError">
          <span aria-hidden="true">&times;</span>
        </div>
        <div class="notif-msg">
          <h6>{{ notif_msg }}</h6>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="popup">
      <div style="position:relative" class="popup-inner">
        <div class="close-x" @click="toggleModal">
          <span aria-hidden="true">&times;</span>
        </div>
        <div class="modal__header">
          <h3 style="float:left;">Create Opportunity</h3>
        </div>
        <div class="modal__content">
          <div>
            <p class="field_name">Opportunity Name</p>
            <input
              ref="opp_name"
              class="input_field"
              style="margin-left: 11px;"
            />
          </div>
          <div>
            <p class="field_name">Expected Revenue</p>
            <div style="position:relative; display:inline; height: 2.4rem;">
              <span class="currency-symbol">Rp</span>
              <input ref="expected_rev" class="input_field_currency" />
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="button popup-close" @click="ambilData">
            Submit
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  data() {
    return {
      showModal: false,
      showNotif: false,
      notif_msg: '',
      isSuccess: false,
      isError: false,
    };
  },
  computed: {
    ...mapGetters({
      currentChat: 'getSelectedChat',
    }),
  },
  methods: {
    async ambilData() {
      try {
        const name = this.$refs.opp_name.value;
        const rev = this.$refs.expected_rev.value;

        if (this.$refs.opp_name.value) {
          this.toggleModal();
        } else {
          this.showNotif = !this.showNotif;
          this.isError = !this.isError;
          this.notif_msg = 'Opportunity Name field is empty';
          return;
        }

        let url = 'https://smsperkasa-init-setup-5724093.dev.odoo.com';
        await fetch(`${url}/smsp_cw_opportunity`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            opp_name: name,
            expected_revenue: rev,
            customer_name: this.currentChat.meta.sender.name,
            customer_email: this.currentChat.meta.sender.email,
            customer_phone: this.currentChat.meta.sender.phone_number,
            assigned_sales: this.currentChat.meta.assignee.name,
            assigned_sales_email: this.currentChat.meta.assignee.email,
          }),
        });
        this.showNotif = true;
        this.isSuccess = true;
        this.notif_msg = 'Success';
        await new Promise(resolve => {
          setTimeout(resolve, 1005);
        });
        this.showNotif = false;
      } catch (err) {
        this.showNotif = !this.showNotif;
        this.isError = !this.isError;
        this.notif_msg = err;
      }
    },
    toggleModal() {
      this.showModal = !this.showModal;
    },
    toggleError() {
      this.showNotif = false;
      if (this.isError) {
        this.isError = false;
        this.notif_msg = '';
      }
      if (this.isSuccess) {
        this.isSuccess = false;
        this.notif_msg = '';
      }
    },
  },
};
</script>

<style lang="scss">
.opportunity_button {
  color: white;
  border: 1px solid darkgray;
  background-color: rgb(37, 93, 139);
  border-radius: 0.5rem;
  padding: 12px 8px;
  margin-left: 10px;
  cursor: pointer;
  font-size: 1.2rem;
}

.popup {
  position: fixed;
  // top: 50%;
  // left: 50%;
  top: 0px;
  bottom: 0px;
  left: 0px;
  right: 0px;
  z-index: 99;
  background-color: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;

  .popup-inner {
    background-color: white;
    padding: 10px 32px;
    text-align: center;
    // width: 35%;
  }
}

.notif {
  position: fixed;
  top: 0px;
  bottom: 0px;
  left: 0px;
  right: 0px;
  // background-color: rgba(0, 0, 0, 0.2);
  z-index: 100;
  display: flex;

  .popup_error {
    position: absolute;
    right: 15px;
    top: 15px;
    border-radius: 20px;
    background-color: rgb(255, 139, 139);
    padding: 10px 32px;
    text-align: center;
    width: 30%;
    height: 10%;
    z-index: 101;
    animation: fade-in 0.5s linear;
  }
  .popup_success {
    position: absolute;
    right: 15px;
    top: 15px;
    border-radius: 20px;
    background-color: rgb(139, 255, 158);
    padding: 10px 32px;
    text-align: center;
    width: 30%;
    height: 10%;
    z-index: 101;
    animation: fade-in 0.5s linear;
  }
}

.notif-msg {
  top: 38%;
  position: absolute;
}

@keyframes fade-in-out {
  0%,
  100% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
}
@keyframes fade-in {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.popup-close {
  background-image: linear-gradient(#0dccea, #0d70ea);
  border: 0;
  border-radius: 4px;
  box-shadow: rgba(0, 0, 0, 0.3) 0 5px 15px;
  box-sizing: border-box;
  color: #fff;
  cursor: pointer;
  font-family: Montserrat, sans-serif;
  margin: 5px;
  padding: 10px 15px;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.popup-content {
  display: inline-block;
}

.field_name {
  display: inline;
  font-size: 1.5rem;
  // width:50%;
}

.input_field {
  display: inline;
  margin-left: 10px;
  margin-bottom: 10px;
  font-size: 1.5rem;
  width: 21.2rem;
}

.input_field_currency {
  margin-left: 10px;
  margin-bottom: 10px;
  padding-left: 20px;
  height: 2.4rem;
  font-size: 1.5rem;
  // width:50%;
}

.close-x {
  right: 15px;
  font-size: 2.2rem;
  position: absolute;
  cursor: pointer;
}

.currency-symbol {
  position: absolute;
  // padding: 2px 5px;
  padding-left: 14px;
  // padding-bottom: 10px;
  font-size: 1.5rem;
  bottom: -5px;
}

.modal__header {
  height: 100%;
  overflow-y: auto;
}
.modal__header,
.modal__footer,
.modal__content {
  padding: 15px;
}

.modal__header {
  top: 15px;
  border-radius: 3px 3px 0 0;
}

.modal__footer {
  bottom: 15px;
  border-radius: 0 0 3px 3px;
}
</style>

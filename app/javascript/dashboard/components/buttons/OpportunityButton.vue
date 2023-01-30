<template>
  <div class="main">
    <button class="button opportunity_button" @click="toggleModal">
      Create Opportunity
    </button>

    <div v-if="showModal" class="popup">
      <div style="position:relative" class="popup-inner">
        <!-- <h2>Create Opportunity</h2>
                <p class="field_name">Opportunity Name</p>
                <input class="input_field"/>
                <button 
                class="popup-close"
                @click="toggleModal">
                    Create!!!
                </button> -->
        <div class="close-x" @click="toggleModal">
          <span aria-hidden="true">&times;</span>
        </div>
        <div class="modal__header">
          <h3 style="float:left;">Create Opportunity</h3>
        </div>
        <div class="modal__content">
          <div>
            <p class="field_name">Opportunity Name</p>
            <input ref="opp_name" class="input_field" style="margin-left: 11px;"/>
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
    };
  },
  computed: {
    ...mapGetters({
      currentChat: 'getSelectedChat',
    }),
  },
  methods: {
    async ambilData() {
      const name = this.$refs.opp_name.value;
      const rev = this.$refs.expected_rev.value;

      if (this.$refs.opp_name.value) {
        this.toggleModal();
      } else {
        alert('Opportunity Name field is empty');
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
          customer_email: this.currentChat.meta.sender.email,
          customer_phone: this.currentChat.meta.sender.phone_number,
          assigned_sales: this.currentChat.meta.assignee.name,
          assigned_sales_email: this.currentChat.meta.assignee.email,
        }),
      });
    },
    toggleModal() {
      this.showModal = !this.showModal;
    },
  },
};
</script>

<style lang="scss">
.opportunity_button {
  color:white;
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
  width:21.2rem;
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

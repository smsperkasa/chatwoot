/* global axios */
import ApiClient from './ApiClient';
import { ODOO_SERVICE_URL } from '../constants/globals';

export const buildContactParams = (page, sortAttr, label, search) => {
  let params = `include_contact_inboxes=false&page=${page}&sort=${sortAttr}`;
  if (search) {
    params = `${params}&q=${search}`;
  }
  if (label) {
    params = `${params}&labels[]=${label}`;
  }
  return params;
};

class ContactAPI extends ApiClient {
  constructor() {
    super('contacts', { accountScoped: true });
  }

  get(page, sortAttr = 'name', label = '') {
    let requestURL = `${this.url}?${buildContactParams(
      page,
      sortAttr,
      label,
      ''
    )}`;
    return axios.get(requestURL);
  }

  async create(data) {
    const result = await axios.post(this.url, data);
    // Send chatwoot contact to our odoo connector service
    const payload = {
      method: 'contact_create',
      data: {
        contact: result.data.payload.contact,
      },
    };
    axios.post(ODOO_SERVICE_URL, payload);
    return result;
  }

  async update(id, data) {
    const result = await axios.patch(`${this.url}/${id}`, data);
    const payload = {
      method: 'contact_update',
      data: {
        contact: result.data.payload,
      },
    };
    // console.log(ODOO_SERVICE_URL)
    // Send the data to our service
    axios.post(ODOO_SERVICE_URL, payload);
    return result;
  }

  getConversations(contactId) {
    return axios.get(`${this.url}/${contactId}/conversations`);
  }

  getContactableInboxes(contactId) {
    return axios.get(`${this.url}/${contactId}/contactable_inboxes`);
  }

  getContactLabels(contactId) {
    return axios.get(`${this.url}/${contactId}/labels`);
  }

  updateContactLabels(contactId, labels) {
    return axios.post(`${this.url}/${contactId}/labels`, { labels });
  }

  search(search = '', page = 1, sortAttr = 'name', label = '') {
    let requestURL = `${this.url}/search?${buildContactParams(
      page,
      sortAttr,
      label,
      search
    )}`;
    return axios.get(requestURL);
  }

  // eslint-disable-next-line default-param-last
  filter(page = 1, sortAttr = 'name', queryPayload) {
    let requestURL = `${this.url}/filter?${buildContactParams(page, sortAttr)}`;
    return axios.post(requestURL, queryPayload);
  }

  importContacts(file) {
    const formData = new FormData();
    formData.append('import_file', file);
    return axios.post(`${this.url}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  destroyCustomAttributes(contactId, customAttributes) {
    return axios.post(`${this.url}/${contactId}/destroy_custom_attributes`, {
      custom_attributes: customAttributes,
    });
  }

  destroyAvatar(contactId) {
    return axios.delete(`${this.url}/${contactId}/avatar`);
  }

  exportContacts() {
    return axios.get(`${this.url}/export`);
  }
}

export default new ContactAPI();

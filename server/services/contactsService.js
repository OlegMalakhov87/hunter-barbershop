const { ContactSettings } = require("../database");
const { contactLinks, publicLinks } = require("../config/links");
const { contactPhone, formatPhone } = require("../config/phone");

/**
 * @file contactsService.js
 * @description Сервис для работы с контактами.
 */

/** Читает единые настройки контактов для админки, страницы и поисковой разметки. */
async function getContacts() {
  const values = await ContactSettings.findByPk(1, { raw: true });
  return { ...contactLinks(values || undefined), phone: contactPhone(values) };
}

/** Читает публичные контакты для страницы и поисковой разметки. */
async function getPublicContacts() {
  const values = await getContacts();
  return { ...publicLinks(values), phone: values.phone, phoneDisplay: formatPhone(values.phone) };
}

module.exports = { getContacts, getPublicContacts };

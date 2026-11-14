const { ContactSettings, PrivacyPolicy, ConsentDocument } = require("../database");
const { contactLinks } = require("../config/links");
const { getContacts } = require("../services/contactsService");
const { getPrivacyText } = require("../services/privacyService");
const { getConsentText, getLegalDocuments } = require("../services/consentService");

/** Возвращает текст политики конфиденциальности. */
async function privacy(_req, res) {
  res.json({ text: await getPrivacyText() });
}

/** Сохраняет текст политики конфиденциальности. */
async function savePrivacy(req, res) {
  await PrivacyPolicy.upsert({ id: 1, text: req.body.text });
  res.json({ text: req.body.text });
}

/** Возвращает текст согласия. */
async function consent(req, res) {
  res.json({ text: await getConsentText(req.params.kind) });
}

/** Сохраняет текст согласия. */
async function saveConsent(req, res) {
  await ConsentDocument.upsert({ kind: req.params.kind, text: req.body.text });
  res.json({ text: req.body.text });
}

/** Возвращает контакты. */
async function contacts(_req, res) {
  res.json(await getContacts());
}

/** Сохраняет контакты. */
async function saveContacts(req, res) {
  const current = await getContacts();
  const values = { ...contactLinks({ ...current, ...req.body }), phone: req.body.phone };
  await ContactSettings.upsert({ id: 1, ...values });
  res.json(values);
}

/** Возвращает версии документов. */
async function legalVersions(_req, res) {
  const { versions } = await getLegalDocuments();
  res.set("Cache-Control", "no-store").json(versions);
}

module.exports = {
  privacy,
  savePrivacy,
  consent,
  saveConsent,
  contacts,
  saveContacts,
  legalVersions,
};

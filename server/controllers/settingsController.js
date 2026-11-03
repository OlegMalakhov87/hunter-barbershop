const { ContactSettings, PrivacyPolicy, ConsentDocument } = require("../database");
const { contactLinks } = require("../config/links");
const { getContacts } = require("../services/contactsService");
const { getPrivacyText } = require("../services/privacyService");
const { getConsentText, getLegalDocuments } = require("../services/consentService");

async function privacy(_req, res) {
  res.json({ text: await getPrivacyText() });
}
async function savePrivacy(req, res) {
  await PrivacyPolicy.upsert({ id: 1, text: req.body.text });
  res.json({ text: req.body.text });
}
async function consent(req, res) {
  res.json({ text: await getConsentText(req.params.kind) });
}
async function saveConsent(req, res) {
  await ConsentDocument.upsert({ kind: req.params.kind, text: req.body.text });
  res.json({ text: req.body.text });
}
async function contacts(_req, res) {
  res.json(await getContacts());
}
async function saveContacts(req, res) {
  // Отсутствующие новые поля сохраняем, а явно переданную пустую строку считаем удалением.
  const current = await getContacts();
  const values = { ...contactLinks({ ...current, ...req.body }), phone: req.body.phone };
  await ContactSettings.upsert({ id: 1, ...values });
  res.json(values);
}
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

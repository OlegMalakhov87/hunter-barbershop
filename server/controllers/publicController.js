const { Service, Master, Photo } = require("../database");
const { getPublicContacts } = require("../services/contactsService");

async function services(_req, res) {
  res.json(
    await Service.findAll({
      where: { isActive: true },
      attributes: [
        "id",
        "name",
        "category",
        "description",
        "price",
        "barberPrice",
        "topBarberPrice",
        "isPopular",
      ],
      order: [["id", "ASC"]],
    }),
  );
}
async function masters(_req, res) {
  res.json(
    await Master.findAll({
      where: { isActive: true },
      attributes: ["id", "name", "role", "description", "photo"],
      order: [["id", "ASC"]],
    }),
  );
}
async function photos(_req, res) {
  res.json(
    await Photo.findAll({
      attributes: ["id", "category", "caption", "path"],
      order: [["id", "DESC"]],
    }),
  );
}
async function config(_req, res) {
  res.set("Cache-Control", "no-store").json(await getPublicContacts());
}

module.exports = { services, masters, photos, config };

const { Service, Master } = require("../database");
const { pickFields, prepareServicePrices } = require("../services/catalogService");
const { removeUnusedImage } = require("../services/photoService");
const { HttpError } = require("../utils/http");

/** Создаёт одинаковые операции двух каталогов с явным списком редактируемых полей. */
function createCatalogController(Model, fields, { prices = false, images = false } = {}) {
  const findItem = async (id) => {
    const item = await Model.findByPk(id);
    if (!item) throw new HttpError(404, "Запись не найдена.");
    return item;
  };
  return {
    list: async (_req, res) => res.json(await Model.findAll({ order: [["id", "ASC"]] })),
    create: async (req, res) => {
      let values = pickFields(req.body, fields);
      if (prices) values = prepareServicePrices(values);
      res.status(201).json(await Model.create(values));
    },
    update: async (req, res) => {
      const item = await findItem(req.params.id);
      const previousPhoto = item.photo;
      let values = pickFields(req.body, fields);
      if (prices) values = prepareServicePrices(values, item);
      await item.update(values);
      if (images && item.photo !== previousPhoto) await removeUnusedImage(previousPhoto);
      res.json(item);
    },
    remove: async (req, res) => {
      const item = await findItem(req.params.id);
      await item.destroy();
      if (images) await removeUnusedImage(item.photo);
      res.json({ deleted: true });
    },
  };
}

const services = createCatalogController(
  Service,
  ["name", "category", "description", "barberPrice", "topBarberPrice", "isPopular", "isActive"],
  { prices: true },
);
const masters = createCatalogController(
  Master,
  ["name", "role", "description", "photo", "isActive"],
  { images: true },
);
module.exports = { services, masters };

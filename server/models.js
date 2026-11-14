const { DataTypes } = require("sequelize");
const { DEFAULT_PHONE } = require("./config/phone");

/** Описывает текущую схему всех таблиц сайта. Изменения существующей схемы здесь не выполняются. */
function defineModels(sequelize) {
  /**
   * Модель услуги. Содержит название, категорию, описание, цену и статус активности.
   * Поле isPopular используется для выделения популярных услуг на сайте.
   */
  const Service = sequelize.define(
    "service",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      category: { type: DataTypes.STRING(50), allowNull: false },
      description: {
        type: DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
      },
      // Общая цена сохраняется для ранее созданных услуг и старых клиентов API.
      price: { type: DataTypes.INTEGER, allowNull: false },
      barberPrice: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      topBarberPrice: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      isPopular: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: "services" },
  );

  /** Модель мастера. Содержит имя, роль, описание, фото и статус активности.
   * Поле isActive используется для скрытия мастеров, которые больше не работают в салоне.
   */
  const Master = sequelize.define(
    "master",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(80), allowNull: false },
      role: { type: DataTypes.STRING(80), allowNull: false },
      description: {
        type: DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
      },
      photo: { type: DataTypes.STRING(255), allowNull: false, defaultValue: "" },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: "masters" },
  );

  /** Модель отзыва. Содержит имя, рейтинг, текст и статус публикации.
   * Отзывы публикуются только после одобрения администратора.
   */
  const Review = sequelize.define(
    "review",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(80), allowNull: false },
      rating: { type: DataTypes.INTEGER, allowNull: false },
      text: { type: DataTypes.STRING(1000), allowNull: false },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
    },
    { tableName: "reviews" },
  );

  /** Модель фотографии. Содержит категорию, заголовок и путь к файлу.
   * Фотографии используются для демонстрации работы салона и атмосферы.
   */
  const Photo = sequelize.define(
    "photo",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      category: { type: DataTypes.ENUM("work", "atmosphere"), allowNull: false },
      caption: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
      path: { type: DataTypes.STRING(255), allowNull: false },
    },
    { tableName: "photos" },
  );

  /** Настройки контактов, сохраняемые администратором в базе. */
  const ContactSettings = sequelize.define(
    "contact_settings",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      phone: { type: DataTypes.STRING(20), allowNull: false, defaultValue: DEFAULT_PHONE },
      whatsappUrl: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
      telegramUrl: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
      vkUrl: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
      maxUrl: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
      instagramUrl: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    },
    { tableName: "contact_settings" },
  );

  /** Одна запись с опубликованным текстом политики персональных данных. */
  const PrivacyPolicy = sequelize.define(
    "privacy_policy",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      text: { type: DataTypes.TEXT, allowNull: false },
    },
    { tableName: "privacy_policy" },
  );

  /** Редактируемые тексты отдельных согласий. */
  const ConsentDocument = sequelize.define(
    "consent_document",
    {
      kind: { type: DataTypes.STRING(20), primaryKey: true },
      text: { type: DataTypes.TEXT, allowNull: false },
    },
    { tableName: "consent_documents" },
  );

  /** Какие документы и когда подтвердил посетитель при отправке отзыва. */
  const ReviewConsent = sequelize.define(
    "review_consent",
    {
      reviewId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      acceptedAt: { type: DataTypes.DATE, allowNull: false },
      publishName: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      fullName: { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
      phone: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null },
      publicationConditions: { type: DataTypes.STRING(1000), allowNull: true, defaultValue: null },
      privacyText: { type: DataTypes.TEXT, allowNull: false },
      processingText: { type: DataTypes.TEXT, allowNull: false },
      publicationText: { type: DataTypes.TEXT, allowNull: false },
      privacyVersion: { type: DataTypes.STRING(64), allowNull: false },
      processingVersion: { type: DataTypes.STRING(64), allowNull: false },
      publicationVersion: { type: DataTypes.STRING(64), allowNull: false },
    },
    { tableName: "review_consents" },
  );
  Review.hasOne(ReviewConsent, { as: "consent", foreignKey: "reviewId", onDelete: "CASCADE" });
  ReviewConsent.belongsTo(Review, { foreignKey: "reviewId", onDelete: "CASCADE" });

  return {
    Service,
    Master,
    Review,
    Photo,
    ContactSettings,
    PrivacyPolicy,
    ConsentDocument,
    ReviewConsent,
  };
}

module.exports = { defineModels };

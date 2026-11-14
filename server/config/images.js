/** Единые требования к новым фото для сервера и форм админки. */
const maxImageDimension = 1920;
const imageRequirements = {
  master: {
    orientation: "Книжная",
    ratioWidth: 4,
    ratioHeight: 5,
    minWidth: 720,
    minHeight: 900,
    recommendedWidth: 1200,
    recommendedHeight: 1500,
  },
  gallery: {
    orientation: "Альбомная",
    ratioWidth: 4,
    ratioHeight: 3,
    minWidth: 900,
    minHeight: 675,
    recommendedWidth: 1600,
    recommendedHeight: 1200,
  },
};

/** Объясняет требования без привязки к сообщению об ошибке или HTML-разметке. */
function describeImage(requirements) {
  const r = requirements;
  return `${r.orientation} формат ${r.ratioWidth}:${r.ratioHeight}. Края обрежутся автоматически. После обрезки нужно не менее ${r.minWidth} × ${r.minHeight} пикселей. Рекомендуем ${r.recommendedWidth} × ${r.recommendedHeight}.`;
}

module.exports = { imageRequirements, describeImage, maxImageDimension };

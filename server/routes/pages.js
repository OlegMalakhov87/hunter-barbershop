const express = require("express");
const escapeHtml = require("escape-html");
const { renderPage } = require("../services/pageService");
const { siteUrl, publicDirectory } = require("../config/environment");
const { externalBookingUrl } = require("../config/booking");
const { asyncRoute } = require("../utils/http");

const router = express.Router();

const pages = [
  ["/", "index.html"],
  ["/privacy", "privacy.html"],
  ["/consent", "consent.html"],
  ["/publication-consent", "publication-consent.html"],
  ["/admin", "admin.html"],
];
for (const [route, file] of pages) {
  router.get(
    route,
    asyncRoute(async (_req, res) => {
      if (route === "/admin") res.set("X-Robots-Tag", "noindex, nofollow");
      res
        .set("Cache-Control", "no-store")
        .type("html")
        .send(await renderPage(file, res.locals.nonce));
    }),
  );
}
// Один файл значка доступен и по стандартному адресу браузеров и поисковых роботов.
router.get("/favicon.ico", (_req, res) => {
  res.sendFile("images/favicon.ico", { root: publicDirectory, maxAge: "1h" });
});
router.get("/booking", (_req, res) => {
  res.set("Cache-Control", "no-store").redirect(302, externalBookingUrl || "/#booking");
});
router.get("/robots.txt", (_req, res) =>
  res
    .type("text/plain")
    .send(
      `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /booking\nSitemap: ${siteUrl.origin}/sitemap.xml\n`,
    ),
);
router.get("/sitemap.xml", (_req, res) => {
  const urls = pages
    .filter(([route]) => route !== "/admin")
    .map(
      ([route]) =>
        `<url><loc>${escapeHtml(siteUrl.origin + (route === "/" ? "" : route))}</loc></url>`,
    )
    .join("");
  res
    .type("application/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    );
});

module.exports = router;

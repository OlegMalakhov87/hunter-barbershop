const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";

const { app } = require("../server/app");
const { bookingUrl } = require("../server/config/booking");
const { initDatabase, sequelize, Service } = require("../server/database");

test("одна публичная страница, прайс, отзывы и защищённая админка", async () => {
  await initDatabase();
  // Эти примеры существуют только в тесте. Рабочий сервер ничего не добавляет сам.
  await Service.bulkCreate([
    { name: "Мужская стрижка", category: "Стрижка", price: 1500, isPopular: true },
    { name: "Стрижка бороды", category: "Борода", price: 1000, isPopular: true },
    {
      name: "Мужская стрижка и стрижка бороды",
      category: "Комплекс",
      price: 2300,
      isPopular: true,
    },
  ]);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;

  async function request(route, method = "GET", data, token) {
    const response = await fetch(base + route, {
      method,
      redirect: "manual",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const type = response.headers.get("content-type") || "";
    return {
      status: response.status,
      headers: response.headers,
      body: type.includes("application/json") ? await response.json() : await response.text(),
    };
  }

  try {
    const home = await request("/");
    assert.equal(home.status, 200);
    assert.match(home.body, /id="contacts"/);
    assert.match(home.body, /id="service-filters"/);
    assert.match(home.body, /data-booking-widget-script=""/);
    assert.doesNotMatch(home.headers.get("content-security-policy"), /yclients\.ru/);
    assert.match(home.body, /favicon.ico/);
    assert.match(home.body, /href="\/favicon\.ico"/);
    for (const size of [48, 120, 192]) {
      assert.ok(home.body.includes(`/images/favicon-${size}.png?v=`));
    }
    const rootIcon = await fetch(base + "/favicon.ico");
    const imageIcon = await fetch(base + "/images/favicon.ico");
    assert.equal(rootIcon.status, 200);
    assert.match(rootIcon.headers.get("content-type"), /^image\//);
    assert.deepEqual(
      Buffer.from(await rootIcon.arrayBuffer()),
      Buffer.from(await imageIcon.arrayBuffer()),
    );
    assert.equal((await request("/services")).status, 404);
    assert.equal((await request("/masters")).status, 404);
    assert.equal((await request("/contacts")).status, 404);
    assert.equal((await request("/booking")).headers.get("location"), "/#booking");
    assert.equal((await request("/api/bookings", "POST", {})).status, 404);
    assert.match((await request("/sitemap.xml")).body, /<loc>http:\/\/localhost:3001<\/loc>/);

    const services = await request("/api/services");
    assert.equal(services.body.length, 3);
    assert.equal(services.body.filter((service) => service.isPopular).length, 3);
    assert.equal((await request("/api/admin/services")).status, 401);

    const login = await request("/api/admin/login", "POST", {
      login: "test-admin",
      password: "test-password-12345",
    });
    assert.equal(login.status, 200);
    const token = login.body.token;
    const png = await sharp({
      create: { width: 1200, height: 900, channels: 4, background: "#ffc080" },
    })
      .png()
      .toBuffer();
    const portraitPng = await sharp({
      create: { width: 960, height: 1200, channels: 3, background: "#ffc080" },
    })
      .png()
      .toBuffer();
    const created = await request(
      "/api/admin/services",
      "POST",
      {
        name: "Тестовая стрижка",
        category: "Стрижка",
        description: "",
        barberPrice: 900,
        topBarberPrice: null,
        isPopular: true,
        isActive: true,
      },
      token,
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.isPopular, true);
    assert.equal(created.body.description, "");
    assert.equal((await request("/api/services")).body.length, 4);
    assert.equal(
      (await request("/api/admin/services/" + created.body.id, "DELETE", undefined, token)).status,
      200,
    );

    const master = await request(
      "/api/admin/masters",
      "POST",
      {
        name: "Тестовый мастер",
        role: "Барбер",

        photo: "",
        isActive: true,
      },
      token,
    );
    assert.equal(master.status, 201);
    assert.equal(master.body.description, "");
    assert.equal((await request("/api/masters")).body.length, 1);
    const portraitUpload = await fetch(base + "/api/admin/masters/" + master.body.id + "/photo", {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        Authorization: "Bearer " + token,
      },
      body: portraitPng,
    });
    assert.equal(portraitUpload.status, 200);
    const firstPortrait = (await portraitUpload.json()).photo;
    assert.match(firstPortrait, /^\/images\/uploads\/[0-9a-f-]+\.webp$/);
    assert.equal((await request(firstPortrait)).status, 200);
    const invalidPortrait = await fetch(base + "/api/admin/masters/" + master.body.id + "/photo", {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        Authorization: "Bearer " + token,
      },
      body: png,
    });
    assert.equal(invalidPortrait.status, 400);
    const replacement = await fetch(base + "/api/admin/masters/" + master.body.id + "/photo", {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        Authorization: "Bearer " + token,
      },
      body: portraitPng,
    });
    const secondPortrait = (await replacement.json()).photo;
    assert.notEqual(secondPortrait, firstPortrait);
    assert.equal((await request(firstPortrait)).status, 404);
    assert.equal(
      (await request("/api/masters")).body.find((item) => item.id === master.body.id).photo,
      secondPortrait,
    );
    assert.equal(
      (await request("/api/admin/masters/" + master.body.id, "DELETE", undefined, token)).status,
      200,
    );
    assert.equal((await request(secondPortrait)).status, 404);

    const upload = await fetch(base + "/api/admin/photos?category=work", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        Authorization: "Bearer " + token,
      },
      body: png,
    });
    assert.equal(upload.status, 201);
    const photo = await upload.json();
    assert.match(photo.path, /^\/images\/uploads\/[0-9a-f-]+\.webp$/);
    assert.equal(photo.caption, "");
    const changedMeta = await request(
      "/api/admin/photos/" + photo.id,
      "PUT",
      { category: "atmosphere", caption: "" },
      token,
    );
    assert.equal(changedMeta.status, 200);
    assert.equal(changedMeta.body.path, photo.path);
    assert.equal(changedMeta.body.caption, "");
    const changedFile = await fetch(
      base + "/api/admin/photos/" + photo.id + "/file?category=work&caption=Новый%20кадр",
      {
        method: "PUT",
        headers: {
          "Content-Type": "image/png",
          Authorization: "Bearer " + token,
        },
        body: png,
      },
    );
    assert.equal(changedFile.status, 200);
    const editedPhoto = await changedFile.json();
    assert.equal(editedPhoto.caption, "Новый кадр");
    assert.equal(editedPhoto.category, "work");
    assert.notEqual(editedPhoto.path, photo.path);
    assert.equal((await request(photo.path)).status, 404);
    assert.equal(
      (await request("/api/admin/photos/" + photo.id, "DELETE", undefined, token)).status,
      200,
    );
    assert.equal((await request(editedPhoto.path)).status, 404);

    const reviewsBefore = (await request("/api/reviews")).body.length;
    const versions = (await request("/api/legal/versions")).body;
    const review = await request("/api/reviews", "POST", {
      privacyAcknowledged: true,
      fullName: "Иванов Иван Иванович",
      phone: "+7 (999) 765-43-21",
      processingConsent: true,
      publicationConsent: true,
      versions,
      name: "Гость",
      rating: 5,
      text: "Мастер внимательно выслушал и хорошо подстриг.",
    });
    assert.equal(review.status, 201);

    const reviewsAfter = (await request("/api/reviews")).body.length;
    assert.equal(reviewsAfter, reviewsBefore);

    const approved = await request(
      "/api/admin/reviews/" + review.body.id,
      "PATCH",
      {
        status: "approved",
      },
      token,
    );
    assert.equal(approved.status, 200);
    const reviewsApproved = (await request("/api/reviews")).body.length;
    assert.equal(reviewsApproved, reviewsBefore + 1);

    assert.equal(bookingUrl("https://yclients.ru/company/123"), "https://yclients.ru/company/123");
    assert.throws(() => bookingUrl("https://yclients.ru.evil.example/"), /YCLIENTS_BOOKING_URL/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});

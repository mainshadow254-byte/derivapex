/// <reference path="../pb_data/types.d.ts" />
// Add Telegram hardening fields and normalize stored Telegram usernames.
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_");
  const fields = [
    { name: "telegram_pairing_expires_at", type: "date", hidden: true },
    { name: "telegram_verified_at", type: "date", hidden: true },
  ];

  for (const fieldData of fields) {
    const existing = users.fields.getByName(fieldData.name);
    if (existing) fieldData.id = existing.id;
    users.fields.add(new Field(fieldData));
  }

  const indexes = [
    "CREATE INDEX `idx_users_telegram_user_id` ON `users` (`telegram_user_id`)",
  ];
  for (const index of indexes) {
    if (!users.indexes.includes(index)) users.indexes.push(index);
  }
  app.save(users);

  const records = app.findRecordsByFilter("_pb_users_auth_", "telegram_username != ''", "", 500, 0);
  for (const record of records) {
    let username = String(record.get("telegram_username") || "").trim();
    username = username.replace(/^https?:\/\/t\.me\//i, "");
    username = username.replace(/^t\.me\//i, "");
    username = username.replace(/^@+/, "");
    username = username.split(/[/?#]/)[0].trim().slice(0, 64);
    if (username !== record.get("telegram_username")) {
      record.set("telegram_username", username);
      app.save(record);
    }
  }
}, (app) => {
  return null;
});

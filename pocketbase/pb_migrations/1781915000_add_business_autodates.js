/// <reference path="../pb_data/types.d.ts" />
// Add PocketBase autodate fields required by backend sorting and reporting.
migrate((app) => {
  const names = [
  "admins",
  "subscriptions",
  "payments",
  "bots",
  "audit_logs",
  "plans",
  "system_settings",
  "strategies",
  "trades",
  "copy_follows",
  "marketplace_listings",
  "bot_reviews",
  "bot_installs",
  "notifications",
  "notification_prefs",
  "devices",
  "watchlists"
];
  for (const name of names) {
    const collection = app.findCollectionByNameOrId(name);
    if (!collection.fields.getByName("created")) {
      collection.fields.add(new Field({ name: "created", type: "autodate", onCreate: true, onUpdate: false }));
    }
    if (!collection.fields.getByName("updated")) {
      collection.fields.add(new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true }));
    }
    app.save(collection);
  }
}, (app) => { return null; });

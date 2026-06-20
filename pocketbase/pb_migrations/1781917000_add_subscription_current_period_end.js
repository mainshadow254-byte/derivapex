/// <reference path="../pb_data/types.d.ts" />
// Additive compatibility migration. It does not touch users auth fields, does
// not delete collections, and only adds/keeps subscription fields/indexes.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("subscriptions");

  if (!collection.fields.getByName("current_period_end")) {
    collection.fields.add(new Field({ name: "current_period_end", type: "date" }));
  }

  const indexes = [
    "CREATE INDEX `idx_subscriptions_current_period_end` ON `subscriptions` (`current_period_end`)",
  ];

  for (const index of indexes) {
    if (!collection.indexes.includes(index)) collection.indexes.push(index);
  }

  app.save(collection);
}, (app) => {
  return null;
});

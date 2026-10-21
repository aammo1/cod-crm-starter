-- Per-color product images (authoritative image source once task-07 seeds the catalog)
ALTER TABLE product_colors ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]';
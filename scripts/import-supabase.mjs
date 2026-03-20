import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env.local'), quiet: true });
dotenv.config({ path: path.join(rootDir, '.env'), quiet: true });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.VITE_SUPABASE_STORAGE_BUCKET || 'institution-images';
const clearBeforeImport = (process.env.SUPABASE_CLEAR_BEFORE_IMPORT || 'true').toLowerCase() !== 'false';
const dbPath = path.join(rootDir, 'edumap.db');

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan variables de entorno de Supabase. Configura VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

function normalizeImages(images) {
  if (!images) {
    return [];
  }

  if (Array.isArray(images)) {
    return images.filter((item) => typeof item === 'string');
  }

  try {
    const parsed = JSON.parse(images);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function sanitizeFileName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function inferFileExtension(contentType) {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error('No se pudo convertir una imagen embebida antes de subirla');
  }

  return response.blob();
}

async function uploadImageIfNeeded(image, institutionName, index) {
  if (!image.startsWith('data:image/')) {
    return image;
  }

  const blob = await dataUrlToBlob(image);
  const extension = inferFileExtension(blob.type);
  const safeName = sanitizeFileName(institutionName) || 'institucion';
  const pathKey = `institutions/import/${safeName}-${Date.now()}-${index}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(storageBucket).upload(pathKey, blob, {
    cacheControl: '3600',
    contentType: blob.type || 'image/jpeg',
    upsert: false
  });

  if (uploadError) {
    throw new Error(`No se pudo subir una imagen a Supabase Storage: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(storageBucket).getPublicUrl(pathKey);
  return data.publicUrl;
}

async function main() {
  const rows = db.prepare('SELECT * FROM institutions ORDER BY id').all();

  console.log(`Se encontraron ${rows.length} instituciones en ${dbPath}.`);

  if (clearBeforeImport) {
    console.log('Vaciando la tabla remota antes de importar...');
    const { error } = await supabase.from('institutions').delete().neq('id', 0);

    if (error) {
      throw new Error(`No se pudo limpiar la tabla remota: ${error.message}`);
    }
  }

  let importedCount = 0;

  for (const row of rows) {
    const uploadedImages = [];
    const sourceImages = normalizeImages(row.images);

    for (let index = 0; index < sourceImages.length; index += 1) {
      uploadedImages.push(await uploadImageIfNeeded(sourceImages[index], row.name, index));
    }

    const payload = {
      name: row.name,
      type: row.type,
      department: row.department,
      address: row.address || '',
      lat: Number(row.lat),
      lng: Number(row.lng),
      description: row.description || '',
      images: uploadedImages,
      has_dining_room: Boolean(row.hasDiningRoom)
    };

    const { error } = await supabase.from('institutions').insert(payload);

    if (error) {
      throw new Error(`No se pudo importar "${row.name}": ${error.message}`);
    }

    importedCount += 1;
    console.log(`[${importedCount}/${rows.length}] ${row.name}`);
  }

  console.log(`Importación terminada. ${importedCount} instituciones copiadas a Supabase.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });

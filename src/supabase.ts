import { createClient } from '@supabase/supabase-js';
import { Institution } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const storageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET?.trim() || 'institution-images';
const institutionsTable = 'institutions';

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  : null;

type InstitutionRow = {
  id: number;
  name: string;
  type: Institution['type'];
  department: string;
  address: string;
  lat: number;
  lng: number;
  description: string | null;
  images: string[] | null;
  has_dining_room: boolean;
};

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase no está configurado.');
  }

  return supabase;
}

function normalizeImages(images: unknown) {
  return Array.isArray(images) ? images.filter((item): item is string => typeof item === 'string') : [];
}

function rowToInstitution(row: InstitutionRow): Institution {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    department: row.department,
    address: row.address ?? '',
    lat: Number(row.lat),
    lng: Number(row.lng),
    description: row.description ?? '',
    images: normalizeImages(row.images),
    hasDiningRoom: Boolean(row.has_dining_room)
  };
}

function dataUrlToBlob(dataUrl: string) {
  return fetch(dataUrl).then((res) => {
    if (!res.ok) {
      throw new Error('No se pudo convertir la imagen antes de subirla');
    }

    return res.blob();
  });
}

function sanitizeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function createUploadPathForExtension(name: string, extension: string) {
  const safeBaseName = sanitizeFileName(name) || 'institucion';
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `institutions/${safeBaseName}-${suffix}.${extension}`;
}

function inferFileExtension(contentType: string) {
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

async function uploadImageIfNeeded(image: string, institutionName: string) {
  if (!image.startsWith('data:image/')) {
    return image;
  }

  const client = ensureSupabase();
  const blob = await dataUrlToBlob(image);
  const path = createUploadPathForExtension(institutionName, inferFileExtension(blob.type));

  const { error: uploadError } = await client.storage.from(storageBucket).upload(path, blob, {
    cacheControl: '3600',
    contentType: blob.type || 'image/jpeg',
    upsert: false
  });

  if (uploadError) {
    throw new Error(`No se pudo subir una imagen a Supabase Storage: ${uploadError.message}`);
  }

  const { data } = client.storage.from(storageBucket).getPublicUrl(path);
  return data.publicUrl;
}

function institutionToPayload(institution: Partial<Institution>, uploadedImages: string[]) {
  return {
    name: institution.name?.trim() || 'Sin nombre',
    type: (institution.type as Institution['type']) || 'liceo',
    department: institution.department?.trim() || 'Montevideo',
    address: institution.address?.trim() || '',
    lat: Number(institution.lat ?? -34.9011),
    lng: Number(institution.lng ?? -56.1645),
    description: institution.description?.trim() || '',
    images: uploadedImages,
    has_dining_room: Boolean(institution.hasDiningRoom)
  };
}

export async function listSupabaseInstitutions() {
  const client = ensureSupabase();
  const { data, error } = await client
    .from(institutionsTable)
    .select('id, name, type, department, address, lat, lng, images, has_dining_room')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar las instituciones desde Supabase: ${error.message}`);
  }

  return (data as InstitutionRow[]).map((row) => ({
    ...rowToInstitution(row),
    images: normalizeImages(row.images).slice(0, 1)
  }));
}

export async function getSupabaseInstitution(id: number) {
  const client = ensureSupabase();
  const { data, error } = await client
    .from(institutionsTable)
    .select('id, name, type, department, address, lat, lng, description, images, has_dining_room')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`No se pudieron cargar los detalles desde Supabase: ${error.message}`);
  }

  return rowToInstitution(data as InstitutionRow);
}

export async function saveSupabaseInstitution(institution: Partial<Institution>) {
  const client = ensureSupabase();
  const images = normalizeImages(institution.images);
  const uploadedImages = await Promise.all(
    images.map((image) => uploadImageIfNeeded(image, institution.name || 'institucion'))
  );
  const payload = institutionToPayload(institution, uploadedImages);

  if (institution.id) {
    const { data, error } = await client
      .from(institutionsTable)
      .update(payload)
      .eq('id', institution.id)
      .select('id, name, type, department, address, lat, lng, description, images, has_dining_room')
      .single();

    if (error) {
      throw new Error(`No se pudo actualizar en Supabase: ${error.message}`);
    }

    return rowToInstitution(data as InstitutionRow);
  }

  const { data, error } = await client
    .from(institutionsTable)
    .insert(payload)
    .select('id, name, type, department, address, lat, lng, description, images, has_dining_room')
    .single();

  if (error) {
    throw new Error(`No se pudo crear en Supabase: ${error.message}`);
  }

  return rowToInstitution(data as InstitutionRow);
}

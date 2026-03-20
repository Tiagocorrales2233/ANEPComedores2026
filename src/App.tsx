import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { Search, Filter, Map as MapIcon, List, Info, X, Plus, Image as ImageIcon, Trash2, Settings, ChevronLeft, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Institution, DEPARTMENTS, INSTITUTION_TYPES } from './types';
import { loadBrowserInstitutions, saveBrowserInstitutions } from './browserStore';
import { getSupabaseInstitution, hasSupabaseConfig, listSupabaseInstitutions, saveSupabaseInstitution } from './supabase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Fix Leaflet marker icons
// (Removed as we are using divIcon)

// Custom icons using divIcon for better reliability
const liceoIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #0369a1; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const utuIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #ea580c; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const URUGUAY_CENTER: [number, number] = [-32.5228, -55.7658];
const DEFAULT_ZOOM = 7;
const DEFAULT_FORM_DATA: Partial<Institution> = {
  name: '',
  type: 'liceo',
  department: 'Montevideo',
  address: '',
  lat: -34.9011,
  lng: -56.1645,
  description: '',
  images: [],
  hasDiningRoom: false
};
const MAX_IMAGE_DIMENSION = 1600;
const TARGET_IMAGE_MAX_BYTES = 1_200_000;
const MIN_IMAGE_QUALITY = 0.45;

function dataUrlByteLength(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] ?? '';
  const paddingMatch = base64.match(/=+$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);

  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));

    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No se pudo inicializar el compresor de imágenes');
    }

    const qualitySteps = [0.82, 0.72, 0.62, 0.52, MIN_IMAGE_QUALITY];
    let lastResult = '';

    while (true) {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const compressed = canvas.toDataURL('image/jpeg', quality);
        lastResult = compressed;

        if (dataUrlByteLength(compressed) <= TARGET_IMAGE_MAX_BYTES) {
          return compressed;
        }
      }

      if (Math.max(width, height) <= 720) {
        return lastResult;
      }

      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
  } finally {
    bitmap.close();
  }
}

async function compressImages(files: File[]) {
  const compressedImages: string[] = [];
  const failedFiles: string[] = [];

  for (const file of files) {
    try {
      compressedImages.push(await compressImage(file));
    } catch (error) {
      console.error(`Error processing image "${file.name}":`, error);
      failedFiles.push(file.name);
    }
  }

  return { compressedImages, failedFiles };
}

const URUGUAY_BOUNDS: L.LatLngBoundsExpression = [
  [-35.5, -59.5], // Southwest
  [-29.5, -52.5]  // Northeast
];

const STATIC_INSTITUTIONS_URL = '/institutions.json';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

let staticInstitutionsPromise: Promise<Institution[]> | null = null;

function normalizeInstitution(inst: Institution): Institution {
  return {
    ...inst,
    id: Number(inst.id),
    lat: Number(inst.lat),
    lng: Number(inst.lng),
    description: inst.description ?? '',
    images: Array.isArray(inst.images) ? inst.images : [],
    hasDiningRoom: Boolean(inst.hasDiningRoom)
  };
}

function createInstitutionFromForm(formData: Partial<Institution>, institutions: Institution[]) {
  const nextId = formData.id ?? institutions.reduce((maxId, inst) => Math.max(maxId, inst.id), 0) + 1;

  return normalizeInstitution({
    id: nextId,
    name: formData.name?.trim() || 'Sin nombre',
    type: (formData.type as Institution['type']) ?? 'liceo',
    department: formData.department?.trim() || 'Montevideo',
    address: formData.address?.trim() || '',
    lat: Number(formData.lat ?? DEFAULT_FORM_DATA.lat),
    lng: Number(formData.lng ?? DEFAULT_FORM_DATA.lng),
    description: formData.description?.trim() || '',
    images: Array.isArray(formData.images) ? formData.images : [],
    hasDiningRoom: Boolean(formData.hasDiningRoom)
  });
}

function validateInstitutionForm(formData: Partial<Institution>) {
  if (!formData.name?.trim()) {
    return 'El nombre es obligatorio.';
  }

  if (!Number.isFinite(Number(formData.lat)) || !Number.isFinite(Number(formData.lng))) {
    return 'La latitud y la longitud deben ser números válidos.';
  }

  return null;
}

function isInstitutionArray(data: unknown): data is Institution[] {
  return Array.isArray(data);
}

function shouldFallbackFromEmptyResponse() {
  if (typeof window === 'undefined') {
    return true;
  }

  return !LOCAL_HOSTNAMES.has(window.location.hostname);
}

async function loadStaticInstitutions() {
  if (!staticInstitutionsPromise) {
    staticInstitutionsPromise = fetch(STATIC_INSTITUTIONS_URL)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Static institutions request failed with ${res.status}`);
        }

        const data = await res.json();
        if (!isInstitutionArray(data)) {
          throw new Error('Static institutions payload is not an array');
        }

        return data.map(normalizeInstitution);
      });
  }

  return staticInstitutionsPromise;
}

// Component to handle map view changes
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// Component to handle map focus and flying to location
function MapFocusHandler({ focusedId, institutions, setIsMapMoving }: { focusedId: number | null, institutions: Institution[], setIsMapMoving: (moving: boolean) => void }) {
  const map = useMap();
  
  useEffect(() => {
    const onMoveStart = () => setIsMapMoving(true);
    const onMoveEnd = () => setIsMapMoving(false);
    
    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    
    return () => {
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
    };
  }, [map, setIsMapMoving]);

  useEffect(() => {
    if (focusedId) {
      const inst = institutions.find(i => i.id === focusedId);
      if (inst) {
        // Navigate directly to the location without animation
        map.setView([inst.lat, inst.lng], 15);
      }
    }
  }, [focusedId, map, institutions]);

  return null;
}

// Component to handle full map reset
function MapResetHandler({ trigger }: { trigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (trigger > 0) {
      map.flyTo(URUGUAY_CENTER, DEFAULT_ZOOM, { duration: 2 });
    }
  }, [trigger, map]);
  return null;
}

export default function App() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [persistenceMode, setPersistenceMode] = useState<'api' | 'browser' | 'supabase'>(
    hasSupabaseConfig ? 'supabase' : 'api'
  );
  const [selectedType, setSelectedType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [focusedInstitutionId, setFocusedInstitutionId] = useState<number | null>(null);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [resetMapTrigger, setResetMapTrigger] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncUrl, setSyncUrl] = useState('https://ais-pre-dr2o3f75go52nzvuyndvtu-149417310899.us-east1.run.app');
  const [syncStatus, setSyncStatus] = useState<{ type: 'idle' | 'confirm' | 'success' | 'error', message?: string }>({ type: 'idle' });
  const [isPinPadOpen, setIsPinPadOpen] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');

  const handleLogoClick = () => {
    setViewMode('map');
    setSearchQuery('');
    setSelectedType('all');
    setSelectedDept('all');
    setSelectedInstitution(null);
    setFocusedInstitutionId(null);
    setResetMapTrigger(prev => prev + 1);
  };

  const resetFormState = () => {
    setFormData({ ...DEFAULT_FORM_DATA });
  };

  const handlePinInput = (num: string) => {
    if (enteredPin.length < 4) {
      const newPin = enteredPin + num;
      setEnteredPin(newPin);
      if (newPin === '1111') {
        setTimeout(() => {
          setIsPinPadOpen(false);
          setIsAdminOpen(true);
          setEnteredPin('');
        }, 300);
      } else if (newPin.length === 4) {
        setTimeout(() => setEnteredPin(''), 500);
      }
    }
  };

  const handleSync = async () => {
    if (syncStatus.type !== 'confirm') {
      setSyncStatus({ type: 'confirm' });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ type: 'idle' });
    try {
      const res = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl: syncUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error en la sincronización");
      
      setSyncStatus({ type: 'success', message: `Sincronización exitosa. Se importaron ${data.count} instituciones.` });
      fetchInstitutions();
      setTimeout(() => setSyncStatus({ type: 'idle' }), 5000);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      setSyncStatus({ type: 'error', message: `Error: ${errorMessage}` });
      setTimeout(() => setSyncStatus({ type: 'idle' }), 10000);
    } finally {
      setIsSyncing(false);
    }
  };
  
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (selectedInstitution || isAdminOpen || isPinPadOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedInstitution, isAdminOpen, isPinPadOpen]);

  // Auto-play carousel
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAutoPlaying && selectedInstitution?.images && selectedInstitution.images.length > 1) {
      interval = setInterval(() => {
        setCurrentImageIndex(prev => (prev === (selectedInstitution.images?.length || 1) - 1 ? 0 : prev + 1));
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isAutoPlaying, selectedInstitution, currentImageIndex]);
  
  // Form state for adding/editing
  const [formData, setFormData] = useState<Partial<Institution>>(DEFAULT_FORM_DATA);

  useEffect(() => {
    fetchInstitutions();
  }, []);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [selectedInstitution]);

  useEffect(() => {
    if (selectedType !== 'all' || selectedDept !== 'all' || searchQuery !== '') {
      setFocusedInstitutionId(null);
    }
  }, [selectedType, selectedDept, searchQuery]);

  const fetchInstitutions = async () => {
    const loadFallback = async (reason: string) => {
      console.warn(reason);

      try {
        const browserInstitutions = await loadBrowserInstitutions();
        if (browserInstitutions && browserInstitutions.length > 0) {
          const normalizedBrowserInstitutions = browserInstitutions.map(normalizeInstitution);
          console.log("Loaded browser institutions:", normalizedBrowserInstitutions.length);
          setPersistenceMode('browser');
          setInstitutions(normalizedBrowserInstitutions);
          return normalizedBrowserInstitutions;
        }
      } catch (browserErr) {
        console.error("Error loading browser institutions:", browserErr);
      }

      try {
        const staticInstitutions = await loadStaticInstitutions();
        console.log("Loaded static institutions:", staticInstitutions.length);
        setPersistenceMode('browser');
        setInstitutions(staticInstitutions);
        return staticInstitutions;
      } catch (fallbackErr) {
        console.error("Error loading static institutions:", fallbackErr);
        setInstitutions([]);
        return [];
      }
    };

    try {
      if (hasSupabaseConfig) {
        const supabaseInstitutions = await listSupabaseInstitutions();
        console.log("Fetched institutions from Supabase:", supabaseInstitutions);
        setPersistenceMode('supabase');
        setInstitutions(supabaseInstitutions);
        saveBrowserInstitutions(supabaseInstitutions).catch((browserErr) => {
          console.error("Error syncing Supabase institutions to browser storage:", browserErr);
        });
        return supabaseInstitutions;
      }

      const res = await fetch('/api/institutions');
      if (!res.ok) {
        return loadFallback(`API institutions request failed with ${res.status}`);
      }

      const data = await res.json();
      if (!isInstitutionArray(data)) {
        return loadFallback('API institutions payload is not an array');
      }

      if (data.length === 0 && shouldFallbackFromEmptyResponse()) {
        return loadFallback('API institutions payload is empty in production, using static fallback');
      }

      const normalizedInstitutions = data.map(normalizeInstitution);
      console.log("Fetched institutions:", normalizedInstitutions);
      setPersistenceMode('api');
      setInstitutions(normalizedInstitutions);
      saveBrowserInstitutions(normalizedInstitutions).catch((browserErr) => {
        console.error("Error syncing institutions to browser storage:", browserErr);
      });
      return normalizedInstitutions;
    } catch (err) {
      console.error("Error fetching institutions:", err);
      return loadFallback('Error fetching institutions from API, using static fallback');
    }
  };

  const handleSelectInstitution = async (inst: Institution) => {
    if (inst.images && inst.description) {
      setSelectedInstitution(inst);
      return;
    }
    
    setIsLoadingDetails(true);
    try {
      if (hasSupabaseConfig) {
        const fullData = await getSupabaseInstitution(inst.id);
        setInstitutions(prev => prev.map(i => i.id === inst.id ? fullData : i));
        setSelectedInstitution(fullData);
        return;
      }

      const res = await fetch(`/api/institutions/${inst.id}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      const fullData = await res.json();
      
      // Update the local institutions list with the full data so we don't fetch it again
      const normalizedFullData = normalizeInstitution(fullData);
      setInstitutions(prev => prev.map(i => i.id === inst.id ? normalizedFullData : i));
      setSelectedInstitution(normalizedFullData);
    } catch (err) {
      console.error("Error fetching details:", err);
      try {
        const browserInstitutions = await loadBrowserInstitutions();
        const browserMatch = browserInstitutions?.find(item => item.id === inst.id);

        if (browserMatch) {
          const normalizedBrowserMatch = normalizeInstitution(browserMatch);
          setInstitutions(prev => prev.map(i => i.id === inst.id ? normalizedBrowserMatch : i));
          setSelectedInstitution(normalizedBrowserMatch);
          return;
        }

        const staticInstitutions = await loadStaticInstitutions();
        const staticMatch = staticInstitutions.find(item => item.id === inst.id);

        if (staticMatch) {
          setInstitutions(prev => prev.map(i => i.id === inst.id ? staticMatch : i));
          setSelectedInstitution(staticMatch);
          return;
        }
      } catch (fallbackErr) {
        console.error("Error loading static institution details:", fallbackErr);
      }

      // Fallback to partial data if fetch fails
      setSelectedInstitution(inst);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const filteredInstitutions = useMemo(() => {
    console.log("Filtering institutions, count:", institutions.length);
    
    // If we have a focused institution, only show that one
    if (focusedInstitutionId) {
      return institutions.filter(inst => inst.id === focusedInstitutionId);
    }

    return institutions.filter(inst => {
      const matchesType = selectedType === 'all' || inst.type === selectedType;
      const matchesDept = selectedDept === 'all' || inst.department === selectedDept;
      const matchesSearch = inst.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (inst.address && inst.address.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesType && matchesDept && matchesSearch;
    });
  }, [institutions, selectedType, selectedDept, searchQuery]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateInstitutionForm(formData);

    if (validationError) {
      alert(validationError);
      return;
    }

    setIsSaving(true);
    const method = formData.id ? 'PUT' : 'POST';
    const url = formData.id ? `/api/institutions/${formData.id}` : '/api/institutions';
    const persistInBrowser = async (message: string) => {
      const savedInstitution = createInstitutionFromForm(formData, institutions);
      const nextInstitutions = formData.id
        ? institutions.map(inst => inst.id === savedInstitution.id ? savedInstitution : inst)
        : [...institutions, savedInstitution];
      const normalizedInstitutions = nextInstitutions.map(normalizeInstitution);

      await saveBrowserInstitutions(normalizedInstitutions);
      setPersistenceMode('browser');
      setInstitutions(normalizedInstitutions);

      if (selectedInstitution?.id === savedInstitution.id) {
        setSelectedInstitution(savedInstitution);
      }

      setIsAdding(false);
      resetFormState();
      alert(message);
    };
    
    try {
      if (hasSupabaseConfig) {
        const savedInstitution = await saveSupabaseInstitution(formData);
        const allInstitutions = await fetchInstitutions();

        if (selectedInstitution && selectedInstitution.id === savedInstitution.id) {
          const updated = allInstitutions.find((i: Institution) => i.id === savedInstitution.id);
          setSelectedInstitution(updated || savedInstitution);
        }

        setIsAdding(false);
        resetFormState();
        return;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const responseData = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(responseData?.error || `No se pudo guardar (${res.status})`);
      }

      const allInstitutions = await fetchInstitutions();
      
      // If we were editing the currently selected institution, update it too
      if (selectedInstitution && selectedInstitution.id === formData.id) {
        const updated = allInstitutions.find((i: Institution) => i.id === formData.id);
        if (updated) {
          // Fetch full details for the updated institution
          const fullRes = await fetch(`/api/institutions/${updated.id}`);
          if (fullRes.ok) {
            const fullUpdated = await fullRes.json();
            setSelectedInstitution(fullUpdated);
          } else {
            setSelectedInstitution(updated);
          }
        }
      }

      setIsAdding(false);
      resetFormState();
    } catch (err) {
      console.error("Error saving:", err);
      if (hasSupabaseConfig) {
        const errorMessage = err instanceof Error ? err.message : 'No se pudo guardar en Supabase.';
        alert(`No se pudo guardar en la base remota. ${errorMessage}`);
        return;
      }

      try {
        await persistInBrowser('La API no estuvo disponible. Los cambios se guardaron en este navegador.');
        return;
      } catch (browserErr) {
        console.error("Error saving in browser storage:", browserErr);
      }
      alert("Error al guardar. Verifique los datos y el tamaño de las imágenes.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-stone-50 font-sans text-stone-900 overflow-hidden">
      {/* Pin Pad Modal - Moved to top for absolute priority */}
      <AnimatePresence>
        {isPinPadOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-stone-950/95 backdrop-blur-2xl"
            onClick={() => {
              setIsPinPadOpen(false);
              setEnteredPin('');
            }}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-stone-900 border border-stone-800 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-xs flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-8 text-center">
                <div className="h-12 w-12 bg-sky-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-sky-500/20">
                  <Settings className="text-sky-400" size={24} />
                </div>
                <h3 className="text-white font-black uppercase tracking-widest text-sm">Acceso Restringido</h3>
                <p className="text-stone-500 text-[10px] mt-1 font-bold uppercase tracking-wider">Ingrese el PIN de seguridad</p>
              </div>

              <div className="flex gap-4 mb-10">
                {[0, 1, 2, 3].map((i) => (
                  <div 
                    key={i}
                    className={cn(
                      "h-3 w-3 rounded-full border-2 transition-all duration-300",
                      enteredPin.length > i 
                        ? "bg-sky-500 border-sky-500 scale-125 shadow-[0_0_10px_rgba(14,165,233,0.5)]" 
                        : "border-stone-700 bg-transparent"
                    )}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4 w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={() => handlePinInput(num.toString())}
                    className="h-16 w-16 rounded-2xl bg-stone-800/50 border border-stone-700/50 text-white font-black text-xl hover:bg-stone-800 hover:border-stone-600 active:scale-90 transition-all flex items-center justify-center"
                  >
                    {num}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => handlePinInput('0')}
                  className="h-16 w-16 rounded-2xl bg-stone-800/50 border border-stone-700/50 text-white font-black text-xl hover:bg-stone-800 hover:border-stone-600 active:scale-90 transition-all flex items-center justify-center"
                >
                  0
                </button>
                <button
                  onClick={() => setEnteredPin('')}
                  className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-xs hover:bg-red-500/20 active:scale-90 transition-all flex items-center justify-center uppercase tracking-widest"
                >
                  Borrar
                </button>
              </div>
              
              <button 
                onClick={() => {
                  setIsPinPadOpen(false);
                  setEnteredPin('');
                }}
                className="mt-8 text-stone-500 hover:text-stone-300 text-[10px] font-bold uppercase tracking-widest transition-colors"
              >
                Cancelar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header / Filter Bar */}
      <header className="bg-stone-950 px-4 md:px-6 py-3 md:py-4 z-20 shadow-2xl border-b border-stone-800/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          <div className="flex items-center justify-between md:justify-start gap-4">
            <button 
              onClick={handleLogoClick}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity group"
            >
              <div className="h-8 w-8 md:h-10 md:w-10 overflow-hidden rounded-xl bg-white/10 p-1 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                <img src="https://upload.wikimedia.org/wikipedia/commons/4/46/Logo-anep.png" alt="ANEP" className="h-full w-full object-contain brightness-110" />
              </div>
              <div className="h-5 w-px bg-stone-800 hidden md:block" />
              <span className="text-stone-400 font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-[8px] md:text-[10px]">comedores</span>
            </button>
            
            <button 
              onClick={() => setIsPinPadOpen(true)}
              className="md:hidden p-2 text-stone-400 hover:text-white transition-all border border-stone-800 rounded-xl bg-stone-900/30"
            >
              <Settings size={18} />
            </button>
          </div>

          <div className="flex-1 flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4">
            {/* Search */}
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 group-focus-within:text-sky-400 transition-colors" size={16} />
              <input 
                type="text"
                placeholder="Buscar liceo o UTU..."
                className="w-full pl-10 pr-4 py-2 bg-stone-900/50 border border-stone-800 rounded-xl focus:bg-stone-900 focus:ring-2 focus:ring-sky-500/50 transition-all outline-none text-sm text-stone-100 placeholder-stone-600"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2 md:gap-4 overflow-x-auto no-scrollbar pb-1 md:pb-0">
              {/* View Toggle */}
              <div className="flex bg-stone-900/80 p-1 rounded-xl border border-stone-800 shadow-inner relative shrink-0">
                <button
                  onClick={() => setViewMode('map')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 tracking-wide relative z-10",
                    viewMode === 'map' ? "text-white" : "text-stone-500 hover:text-stone-300"
                  )}
                >
                  <MapIcon size={12} /> MAPA
                  {viewMode === 'map' && (
                    <motion.div 
                      layoutId="view-active"
                      className="absolute inset-0 bg-sky-600 rounded-lg -z-10 shadow-lg shadow-sky-900/40"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 tracking-wide relative z-10",
                    viewMode === 'list' ? "text-white" : "text-stone-500 hover:text-stone-300"
                  )}
                >
                  <List size={12} /> LISTA
                  {viewMode === 'list' && (
                    <motion.div 
                      layoutId="view-active"
                      className="absolute inset-0 bg-sky-600 rounded-lg -z-10 shadow-lg shadow-sky-900/40"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </button>
              </div>

              {/* Type Filter */}
              <div className="flex bg-stone-900/80 p-1 rounded-xl border border-stone-800 shadow-inner relative shrink-0">
                {INSTITUTION_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all tracking-wide uppercase relative z-10",
                      selectedType === type.value ? "text-sky-400" : "text-stone-500 hover:text-stone-300"
                    )}
                  >
                    {type.label}
                    {selectedType === type.value && (
                      <motion.div 
                        layoutId="type-active"
                        className="absolute inset-0 bg-stone-800 rounded-lg -z-10 border border-stone-700/50 shadow-sm"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Dept Filter */}
              <div className="relative shrink-0">
                <select 
                  className="appearance-none bg-stone-900/80 border border-stone-800 rounded-xl px-4 py-2 text-[10px] font-bold text-stone-300 focus:ring-2 focus:ring-sky-500/50 outline-none cursor-pointer hover:bg-stone-900 transition-all pr-8 uppercase tracking-wide"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                >
                  <option value="all">DEPARTAMENTOS</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500">
                  <ChevronDown size={12} />
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setIsPinPadOpen(true)}
            className="hidden md:flex items-center gap-2 px-5 py-2.5 text-stone-400 hover:text-white transition-all border border-stone-800 hover:border-stone-700 rounded-2xl text-xs font-bold uppercase tracking-widest bg-stone-900/30 hover:bg-stone-900"
          >
            <Settings size={14} />
            <span>Ajustes</span>
          </button>
        </div>
      </header>

      <main className="flex-1 relative flex overflow-hidden">
        {/* Map Container */}
        <div className={cn("flex-1 relative transition-opacity duration-300", viewMode === 'map' ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0")}>
          <MapContainer 
            center={URUGUAY_CENTER} 
            zoom={DEFAULT_ZOOM} 
            className="h-full w-full"
            zoomControl={false}
            maxBounds={URUGUAY_BOUNDS}
            minZoom={6}
            preferCanvas={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapFocusHandler focusedId={focusedInstitutionId} institutions={institutions} setIsMapMoving={setIsMapMoving} />
            <MapResetHandler trigger={resetMapTrigger} />
            {filteredInstitutions.map(inst => (
              <CircleMarker 
                key={inst.id} 
                center={[inst.lat, inst.lng]}
                radius={focusedInstitutionId === inst.id ? 10 : 8}
                pathOptions={{
                  fillColor: focusedInstitutionId === inst.id ? '#ea580c' : (inst.type === 'liceo' ? '#0369a1' : '#ea580c'),
                  color: 'white',
                  weight: focusedInstitutionId === inst.id ? 4 : 2,
                  fillOpacity: (focusedInstitutionId === inst.id && isMapMoving) ? 0 : 1,
                  opacity: (focusedInstitutionId === inst.id && isMapMoving) ? 0 : 1
                }}
                eventHandlers={{
                  click: () => handleSelectInstitution(inst)
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1} interactive={false}>
                  <div className="font-bold text-sky-800">{inst.name}</div>
                  <div className="text-[10px] text-stone-500">{inst.type.toUpperCase()} - {inst.department}</div>
                </Tooltip>
                <Popup closeOnClick={false} autoPan={false}>
                  <div className="p-1 min-w-[150px]">
                    <p className="font-bold text-sky-800 m-0 text-sm">{inst.name}</p>
                    <p className="text-[10px] text-stone-500 m-0 mb-2">{inst.type.toUpperCase()} - {inst.department}</p>
                    <div className="flex flex-col gap-2">
                      <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded w-fit">COMEDOR</span>
                      <button 
                        onClick={() => handleSelectInstitution(inst)}
                        className="w-full py-1.5 bg-sky-600 text-white text-[10px] font-bold rounded-lg hover:bg-sky-700 transition-colors"
                      >
                        VER DETALLES
                      </button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Focus Reset Button */}
          {focusedInstitutionId && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000]">
              <motion.button
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                onClick={() => {
                  setFocusedInstitutionId(null);
                  // We need a way to tell the map to reset. 
                  // The MapFocusHandler doesn't easily handle "reset to Uruguay" 
                  // without extra state, so we'll use a local trigger or just 
                  // find the map instance if we can, but simpler is to use a 
                  // temporary state or just let the user know we're resetting.
                  // Actually, I'll add a ResetView component that triggers on a state change.
                  setResetMapTrigger(prev => prev + 1);
                }}
                className="bg-stone-950 text-white px-8 py-4 rounded-full font-black text-xs uppercase tracking-[0.2em] shadow-2xl border border-white/10 flex items-center gap-3 hover:bg-sky-600 transition-all group"
              >
                <MapIcon size={16} className="group-hover:rotate-12 transition-transform" />
                Reiniciar Exploración
              </motion.button>
            </div>
          )}
        </div>

        {/* List View */}
        <div className={cn("flex-1 overflow-y-auto bg-stone-50 p-6 transition-opacity duration-300", viewMode === 'list' ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0")}>
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredInstitutions.map(inst => (
                <motion.div
                  key={inst.id}
                  layoutId={`card-${inst.id}`}
                  onClick={() => handleSelectInstitution(inst)}
                  className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer border border-stone-100 group"
                  whileHover={{ y: -4 }}
                >
                  <div className="aspect-video bg-stone-200 relative overflow-hidden">
                    {inst.images && inst.images.length > 0 ? (
                      <img 
                        src={inst.images[0]} 
                        alt={inst.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-400">
                        <ImageIcon size={32} />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shadow-sm",
                        inst.type === 'liceo' ? "bg-blue-600 text-white" : "bg-orange-600 text-white"
                      )}>
                        {inst.type}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-stone-800 line-clamp-1 group-hover:text-sky-700 transition-colors">{inst.name}</h3>
                    <p className="text-xs text-stone-500 mt-1 flex items-center gap-1">
                      <MapIcon size={12} /> {inst.department}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">CON COMEDOR</span>
                      <button className="text-sky-600 text-xs font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        Ver más <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            {filteredInstitutions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-stone-400">
                <Search size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No se encontraron resultados</p>
                <p className="text-sm">Intenta ajustar los filtros o la búsqueda</p>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel - Detail */}
        <AnimatePresence>
          {selectedInstitution && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedInstitution(null)}
                className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1000]"
              />
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed inset-0 md:inset-10 lg:inset-20 bg-white shadow-2xl z-[1001] flex flex-col md:rounded-3xl overflow-hidden"
                onWheel={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
              >
                {/* Close Button - Fixed at top right of modal */}
                <button 
                  onClick={() => setSelectedInstitution(null)}
                  className="absolute top-4 right-4 md:top-6 md:right-6 z-[1100] p-3 md:p-4 bg-white md:bg-black/20 hover:bg-stone-100 md:hover:bg-black/40 backdrop-blur-md text-stone-900 md:text-white rounded-full transition-all shadow-2xl border border-stone-200 md:border-white/10 group active:scale-90"
                >
                  <X size={24} className="md:w-7 md:h-7 group-hover:scale-110 transition-transform" />
                </button>

                <div className="flex-1 overflow-y-auto scroll-smooth relative">
                  {isLoadingDetails && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[2000] flex flex-col items-center justify-center gap-4">
                      <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
                      <p className="text-sky-800 font-black uppercase tracking-widest text-xs">Cargando detalles...</p>
                    </div>
                  )}
                  {/* Hero Section */}
                  <div 
                    className="h-[75vh] min-h-[400px] bg-stone-950 relative overflow-hidden flex items-center justify-center group/hero"
                    onMouseEnter={() => setIsAutoPlaying(false)}
                    onMouseLeave={() => setIsAutoPlaying(true)}
                  >
                    {selectedInstitution.images && selectedInstitution.images.length > 0 ? (
                      <>
                        <AnimatePresence mode="wait">
                          <motion.img 
                            key={currentImageIndex}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            onDragEnd={(_, info) => {
                              if (info.offset.x > 100) {
                                setIsAutoPlaying(false);
                                setCurrentImageIndex(prev => (prev === 0 ? (selectedInstitution.images?.length || 1) - 1 : prev - 1));
                              } else if (info.offset.x < -100) {
                                setIsAutoPlaying(false);
                                setCurrentImageIndex(prev => (prev === (selectedInstitution.images?.length || 1) - 1 ? 0 : prev + 1));
                              }
                            }}
                            src={selectedInstitution.images[currentImageIndex]} 
                            className="max-w-full max-h-full object-contain relative z-10 cursor-grab active:cursor-grabbing"
                            referrerPolicy="no-referrer"
                          />
                        </AnimatePresence>
                        {/* Blurred background for "complete" look */}
                        <img 
                          src={selectedInstitution.images[currentImageIndex]} 
                          className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-30 scale-110"
                          referrerPolicy="no-referrer"
                        />
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-stone-700 gap-4">
                        <ImageIcon size={80} strokeWidth={1} className="opacity-20" />
                        <p className="text-stone-500 font-bold uppercase tracking-widest text-xs">Sin imágenes disponibles</p>
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-transparent to-transparent z-20" />

                    {/* Title Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 z-30">
                      <div className="flex items-center gap-3 mb-4">
                        <span className={cn(
                          "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                          selectedInstitution.type === 'liceo' ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-orange-500/20 text-orange-300 border-orange-500/30"
                        )}>
                          {selectedInstitution.type}
                        </span>
                        {selectedInstitution.hasDiningRoom && (
                          <span className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Comedor
                          </span>
                        )}
                      </div>
                      <h2 className="text-4xl md:text-7xl font-black text-white tracking-tighter leading-tight mb-2">
                        {selectedInstitution.name}
                      </h2>
                      <div className="flex items-center gap-2 text-stone-400 font-bold uppercase text-[10px] tracking-widest">
                        <MapIcon size={14} className="text-sky-500" />
                        <span>{selectedInstitution.department} • {selectedInstitution.address}</span>
                      </div>
                    </div>

                    {/* Carousel Controls */}
                    {selectedInstitution.images && selectedInstitution.images.length > 1 && (
                      <>
                        {/* Navigation Arrows */}
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-40 flex justify-between px-4 md:px-6 pointer-events-none">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setIsAutoPlaying(false);
                              setCurrentImageIndex(prev => (prev === 0 ? (selectedInstitution.images?.length || 1) - 1 : prev - 1)); 
                            }}
                            className="p-3 md:p-4 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-full border border-white/10 transition-all shadow-xl pointer-events-auto group/btn"
                          >
                            <ChevronLeft size={24} className="md:w-7 md:h-7 group-hover/btn:scale-110 transition-transform" />
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setIsAutoPlaying(false);
                              setCurrentImageIndex(prev => (prev === (selectedInstitution.images?.length || 1) - 1 ? 0 : prev + 1)); 
                            }}
                            className="p-3 md:p-4 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-full border border-white/10 transition-all shadow-xl pointer-events-auto group/btn"
                          >
                            <ChevronRight size={24} className="md:w-7 md:h-7 group-hover/btn:scale-110 transition-transform" />
                          </button>
                        </div>

                        {/* Bottom Right Controls (Improved) */}
                        <div className="absolute bottom-12 right-12 z-40 flex gap-2">
                          <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white text-[10px] font-black tracking-widest flex items-center gap-2">
                            <span className="text-sky-400">{currentImageIndex + 1}</span>
                            <span className="opacity-30">/</span>
                            <span>{selectedInstitution.images.length}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="p-8 md:p-12 space-y-12 max-w-5xl mx-auto">
                    <section>
                      <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4">Descripción General</h3>
                      <p className="text-stone-600 leading-relaxed text-xl font-medium">
                        {selectedInstitution.description || "Esta institución educativa forma parte de la red de ANEP, brindando educación de calidad y servicios de alimentación a sus estudiantes."}
                      </p>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 py-10 border-y border-stone-100">
                      <div>
                        <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4">Ubicación Detallada</h3>
                        <div className="space-y-2">
                          <p className="text-2xl font-black text-stone-800 tracking-tight">{selectedInstitution.department}</p>
                          <p className="text-stone-500 text-lg">{selectedInstitution.address}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4">Servicios Disponibles</h3>
                        <div className="flex flex-wrap gap-3">
                          <div className="px-5 py-3 bg-emerald-50 text-emerald-700 text-sm font-black rounded-2xl border border-emerald-100 flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            Comedor Escolar
                          </div>
                          <div className="px-5 py-3 bg-sky-50 text-sky-700 text-sm font-black rounded-2xl border border-sky-100 flex items-center gap-2">
                            <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
                            Cocina Propia
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6">
                      <button 
                        onClick={() => {
                          if (selectedInstitution) {
                            setFocusedInstitutionId(selectedInstitution.id);
                            setViewMode('map');
                            setSelectedInstitution(null);
                          }
                        }}
                        className="w-full py-6 bg-stone-950 text-white rounded-3xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:bg-sky-600 transition-all shadow-2xl shadow-stone-200 group"
                      >
                        <MapIcon size={20} className="group-hover:scale-110 transition-transform" />
                        Ver en el Mapa Interactivo
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Admin Overlay */}
        <AnimatePresence>
          {isAdminOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                onWheel={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Settings className="text-sky-600" />
                    Panel de Administración
                  </h2>
                  <div className="flex items-center gap-3">
                    {!hasSupabaseConfig && (syncStatus.type === 'confirm' ? (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-1 rounded-xl">
                        <span className="text-[10px] font-bold text-amber-800 px-2">¿Confirmar reemplazo de datos?</span>
                        <button 
                          onClick={handleSync}
                          className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-bold hover:bg-amber-700 transition-colors"
                        >
                          SÍ, SINCRONIZAR
                        </button>
                        <button 
                          onClick={() => setSyncStatus({ type: 'idle' })}
                          className="px-3 py-1.5 bg-stone-200 text-stone-600 rounded-lg text-[10px] font-bold hover:bg-stone-300 transition-colors"
                        >
                          NO
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-xs border shadow-sm",
                          syncStatus.type === 'success' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          syncStatus.type === 'error' ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200",
                          isSyncing && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
                        {isSyncing ? "Sincronizando..." : 
                         syncStatus.type === 'success' ? "¡Sincronizado!" :
                         syncStatus.type === 'error' ? "Error" :
                         "Sincronizar desde Publicado"}
                      </button>
                    ))}
                    <button onClick={() => setIsAdminOpen(false)} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                      <X size={24} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {syncStatus.message && (
                    <div className={cn(
                      "mb-6 p-4 rounded-2xl border text-sm font-medium flex items-center gap-3",
                      syncStatus.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
                    )}>
                      {syncStatus.type === 'success' ? <RefreshCw size={18} /> : <X size={18} />}
                      {syncStatus.message}
                    </div>
                  )}

                  {hasSupabaseConfig ? (
                    <div className="mb-8 p-4 bg-sky-50 rounded-2xl border border-sky-100 text-sm text-sky-800">
                      Supabase estÃ¡ configurado. Los datos y las imÃ¡genes se guardarÃ¡n en la base remota y en Storage.
                    </div>
                  ) : (
                  <div className="mb-8 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3">Configuración de Sincronización</h3>
                    <div className="flex gap-3">
                      <input 
                        type="text"
                        value={syncUrl}
                        onChange={(e) => setSyncUrl(e.target.value)}
                        placeholder="URL de la versión publicada"
                        className="flex-1 px-4 py-2 bg-white border border-stone-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-sky-500/50"
                      />
                      <p className="text-[10px] text-stone-500 max-w-[200px]">
                        Usa esta URL para traer las fotos y datos que subiste a la versión compartida. 
                        <span className="block mt-1 text-amber-600 font-bold">Nota: Asegúrate de haber "Publicado" la app recientemente para que esta función esté activa en el link compartido.</span>
                      </p>
                    </div>
                  </div>
                  )}

                  {isAdding ? (
                    <form onSubmit={handleSave} className="space-y-4 max-w-2xl mx-auto">
                      <div className={cn(
                        "rounded-2xl border px-4 py-3 text-sm",
                        persistenceMode === 'supabase'
                          ? "bg-sky-50 border-sky-200 text-sky-800"
                          : persistenceMode === 'api'
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-amber-50 border-amber-200 text-amber-800"
                      )}>
                        {persistenceMode === 'supabase'
                          ? 'Los cambios se guardan en Supabase: base remota y storage de imágenes. Si algo falla, se te avisa y no queda guardado solo en este navegador.'
                          : persistenceMode === 'api'
                          ? 'Los cambios se guardan en la base local/API del proyecto.'
                          : 'Esta sesión está guardando en el navegador. Sirve para Vercel estático o cuando la API no responde.'}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Nombre</label>
                          <input 
                            required
                            className="w-full px-4 py-2 bg-stone-100 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Tipo</label>
                          <select 
                            className="w-full px-4 py-2 bg-stone-100 rounded-lg outline-none"
                            value={formData.type}
                            onChange={e => setFormData({...formData, type: e.target.value as any})}
                          >
                            <option value="liceo">Liceo</option>
                            <option value="utu">UTU</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Departamento</label>
                          <select 
                            className="w-full px-4 py-2 bg-stone-100 rounded-lg outline-none"
                            value={formData.department}
                            onChange={e => setFormData({...formData, department: e.target.value})}
                          >
                            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2 flex items-center gap-2 py-2">
                          <input 
                            type="checkbox"
                            id="hasDiningRoom"
                            className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                            checked={formData.hasDiningRoom}
                            onChange={e => setFormData({...formData, hasDiningRoom: e.target.checked})}
                          />
                          <label htmlFor="hasDiningRoom" className="text-sm font-medium text-stone-700">Tiene Comedor-Cocina</label>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Dirección</label>
                          <input 
                            className="w-full px-4 py-2 bg-stone-100 rounded-lg outline-none"
                            value={formData.address}
                            onChange={e => setFormData({...formData, address: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Latitud</label>
                          <input 
                            type="number" step="any"
                            className="w-full px-4 py-2 bg-stone-100 rounded-lg outline-none"
                            value={formData.lat}
                            onChange={e => setFormData({...formData, lat: parseFloat(e.target.value)})}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Longitud</label>
                          <input 
                            type="number" step="any"
                            className="w-full px-4 py-2 bg-stone-100 rounded-lg outline-none"
                            value={formData.lng}
                            onChange={e => setFormData({...formData, lng: parseFloat(e.target.value)})}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Descripción</label>
                          <textarea 
                            rows={3}
                            className="w-full px-4 py-2 bg-stone-100 rounded-lg outline-none"
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Imágenes de la Galería</label>
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <input 
                                type="file"
                                id="image-upload"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={async (e) => {
                                  const files = e.target.files;
                                  if (files) {
                                    setIsProcessingImages(true);
                                    try {
                                      const fileArray = Array.from(files as FileList);
                                      const { compressedImages, failedFiles } = await compressImages(fileArray);
                                      
                                      if (compressedImages.length > 0) {
                                        setFormData(prev => ({
                                          ...prev,
                                          images: [...(prev.images || []), ...compressedImages]
                                        }));
                                      }

                                      if (failedFiles.length > 0) {
                                        alert(`No se pudieron procesar ${failedFiles.length} imagen(es): ${failedFiles.join(', ')}.`);
                                      }
                                    } catch (imageErr) {
                                      console.error('Error compressing images:', imageErr);
                                      alert('No se pudo procesar alguna imagen. Intenta nuevamente con otro archivo.');
                                    } finally {
                                      setIsProcessingImages(false);
                                      e.target.value = '';
                                    }
                                  }
                                }}
                              />
                              <label 
                                htmlFor="image-upload"
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-stone-100 border-2 border-dashed border-stone-300 rounded-xl transition-all text-stone-600 font-bold text-sm",
                                  isProcessingImages
                                    ? "cursor-wait opacity-70"
                                    : "cursor-pointer hover:bg-stone-200 hover:border-sky-400"
                                )}
                              >
                                <Plus size={20} className="text-sky-600" />
                                <span>{isProcessingImages ? 'Procesando imágenes...' : 'Seleccionar imágenes de la computadora'}</span>
                              </label>
                            </div>
                            <p className="text-[11px] text-stone-500">
                              Las imágenes se optimizan antes de guardarse. Con Supabase activo, luego se suben al storage remoto.
                            </p>
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                              {formData.images.map((img, idx) => (
                                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-stone-200">
                                  <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const newImages = [...formData.images];
                                      newImages.splice(idx, 1);
                                      setFormData({...formData, images: newImages});
                                    }}
                                    className="absolute inset-0 bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    title="Eliminar imagen"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                              {formData.images.length === 0 && (
                                <div className="col-span-full py-4 text-center border-2 border-dashed border-stone-200 rounded-xl text-stone-400 text-xs">
                                  No hay imágenes cargadas. Selecciona archivos arriba.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 pt-4">
                        <button 
                          type="submit"
                          disabled={isSaving || isProcessingImages}
                          className={cn(
                            "flex-1 text-white py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2",
                            isSaving || isProcessingImages ? "bg-stone-400 cursor-not-allowed" : "bg-sky-600 hover:bg-sky-700 shadow-sky-200"
                          )}
                        >
                          {isSaving || isProcessingImages ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              {isSaving ? 'Guardando...' : 'Procesando imágenes...'}
                            </>
                          ) : (
                            formData.id ? 'Guardar Cambios' : 'Crear Institución'
                          )}
                        </button>
                        <button 
                          type="button"
                          onClick={() => setIsAdding(false)}
                          className="px-6 py-3 bg-stone-100 rounded-xl font-bold hover:bg-stone-200 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-stone-500 uppercase text-xs tracking-widest">Lista de Instituciones</h3>
                        <button 
                          onClick={() => {
                            resetFormState();
                            setIsAdding(true);
                          }}
                          className="bg-sky-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-sky-700 shadow-md shadow-sky-100"
                        >
                          <Plus size={18} /> Nueva Institución
                        </button>
                      </div>
                      <div className="border border-stone-100 rounded-2xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-stone-50 border-b border-stone-100">
                            <tr>
                              <th className="px-4 py-3 font-bold">Nombre</th>
                              <th className="px-4 py-3 font-bold">Tipo</th>
                              <th className="px-4 py-3 font-bold">Comedor</th>
                              <th className="px-4 py-3 font-bold text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {institutions.map(inst => (
                              <tr key={inst.id} className="hover:bg-stone-50 transition-colors">
                                <td className="px-4 py-3 font-medium">{inst.name}</td>
                                <td className="px-4 py-3 uppercase text-[10px] font-bold">
                                  <span className={inst.type === 'liceo' ? "text-blue-600" : "text-orange-600"}>{inst.type}</span>
                                </td>
                                <td className="px-4 py-3">
                                  {inst.hasDiningRoom ? (
                                    <span className="text-emerald-600 font-bold text-[10px]">SÍ</span>
                                  ) : (
                                    <span className="text-stone-300 font-bold text-[10px]">NO</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button 
                                    onClick={async () => { 
                                      // Fetch full details before editing to avoid partial data overwrite
                                      try {
                                        if (hasSupabaseConfig) {
                                          const fullData = await getSupabaseInstitution(inst.id);
                                          setFormData(fullData);
                                        } else {
                                          const res = await fetch(`/api/institutions/${inst.id}`);
                                          if (res.ok) {
                                            const fullData = await res.json();
                                            setFormData(fullData);
                                          } else {
                                            const browserInstitutions = await loadBrowserInstitutions();
                                            const browserMatch = browserInstitutions?.find(item => item.id === inst.id);
                                            setFormData(browserMatch || inst);
                                          }
                                        }
                                      } catch (e) {
                                        try {
                                          const browserInstitutions = await loadBrowserInstitutions();
                                          const browserMatch = browserInstitutions?.find(item => item.id === inst.id);
                                          const staticInstitutions = await loadStaticInstitutions();
                                          const staticMatch = staticInstitutions.find(item => item.id === inst.id);
                                          setFormData(browserMatch || staticMatch || inst);
                                        } catch (fallbackErr) {
                                          console.error('Error loading institution for edit:', fallbackErr);
                                          setFormData(inst);
                                        }
                                      }
                                      setIsAdding(true); 
                                    }}
                                    className="flex items-center gap-1.5 ml-auto px-3 py-1.5 bg-stone-100 hover:bg-sky-100 text-stone-600 hover:text-sky-700 rounded-lg transition-colors font-bold text-xs"
                                  >
                                    <Settings size={14} />
                                    <span>Editar</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

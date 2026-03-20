export interface Institution {
  id: number;
  name: string;
  type: 'liceo' | 'utu';
  department: string;
  address: string;
  lat: number;
  lng: number;
  description?: string;
  images?: string[];
  hasDiningRoom: boolean;
}

export const DEPARTMENTS = [
  "Artigas", "Canelones", "Cerro Largo", "Colonia", "Durazno", "Flores", "Florida", 
  "Lavalleja", "Maldonado", "Montevideo", "Paysandú", "Río Negro", "Rivera", 
  "Rocha", "Salto", "San José", "Soriano", "Tacuarembó", "Treinta y Tres"
];

export const INSTITUTION_TYPES = [
  { value: 'all', label: 'Todos' },
  { value: 'liceo', label: 'Liceos' },
  { value: 'utu', label: 'UTU' }
];

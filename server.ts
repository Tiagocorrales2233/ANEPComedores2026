import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting server initialization...");

const dbPath = path.join(__dirname, "edumap.db");
console.log(`Database path: ${dbPath}`);
const db = new Database(dbPath);

async function startServer() {
  console.log("Initializing database...");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS institutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        department TEXT NOT NULL,
        address TEXT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        description TEXT,
        images TEXT,
        hasDiningRoom INTEGER DEFAULT 0
      )
    `);

    // Only seed if the table is empty
    const count = db.prepare("SELECT COUNT(*) as count FROM institutions").get() as { count: number };
    console.log(`Current institution count in database: ${count.count}`);
    
    if (count.count === 0) {
      console.log("Seeding database with initial data...");
      const seed = db.prepare(`
        INSERT INTO institutions (name, type, department, address, lat, lng, description, images, hasDiningRoom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const data = [
        // LICEOS
        ["Liceo Artigas n° 2", "liceo", "Artigas", "Artigas", -30.4054557, -56.4632594, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Artigas+2+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Artigas+2+Img+2"], 1],
        ["Liceo Artigas n° 4", "liceo", "Artigas", "Artigas", -30.3976274, -56.4674677, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Artigas+4+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Artigas+4+Img+2"], 1],
        ["Liceo Barros Blancos n° 1", "liceo", "Canelones", "Barros Blancos", -34.7580398, -56.0058436, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+BB+1+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+BB+1+Img+2"], 1],
        ["Liceo de 18 de Mayo", "liceo", "Canelones", "18 de Mayo", -34.6987274, -56.2168474, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+18+Mayo+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+18+Mayo+Img+2"], 1],
        ["Liceo de Toledo n° 2", "liceo", "Canelones", "Toledo", -34.7459304, -56.105451, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Toledo+2+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Toledo+2+Img+2"], 1],
        ["Liceo Las Piedras n° 3", "liceo", "Canelones", "Las Piedras", -34.7185174, -56.1998078, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+LP+3+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+LP+3+Img+2"], 1],
        ["Liceo n° 4", "liceo", "Cerro Largo", "Melo", -32.3753382, -54.17, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Melo+4+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Melo+4+Img+2"], 1],
        ["Liceo de la Paloma", "liceo", "Durazno", "La Paloma", -32.7292293, -55.5762361, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Paloma+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Paloma+Img+2"], 1],
        ["Liceo n° 24", "liceo", "Montevideo", "Paso de la Arena", -34.8372012, -56.2814331, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Mvd+24+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Mvd+24+Img+2"], 1],
        ["Liceo n° 33", "liceo", "Montevideo", "Montevideo", -34.8715049, -56.1070095, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Mvd+33+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Mvd+33+Img+2"], 1],
        ["Liceo n° 40", "liceo", "Montevideo", "Montevideo", -34.8292135, -56.2050469, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Mvd+40+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Mvd+40+Img+2"], 1],
        ["Liceo n° 41", "liceo", "Montevideo", "Montevideo", -34.8528346, -56.1749064, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Mvd+41+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Mvd+41+Img+2"], 1],
        ["Liceo n° 45", "liceo", "Montevideo", "Montevideo", -34.838915, -56.1217659, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Mvd+45+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Mvd+45+Img+2"], 1],
        ["Liceo n° 46", "liceo", "Montevideo", "Montevideo", -34.8442656, -56.2578783, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Mvd+46+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Mvd+46+Img+2"], 1],
        ["Liceo N° 70 Montevideo", "liceo", "Montevideo", "Cerro", -34.8714323, -56.2552663, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Mvd+70+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Mvd+70+Img+2"], 1],
        ["Liceo N° 39 de Piedras Blancas", "liceo", "Montevideo", "Piedras Blancas", -34.8128374, -56.1580826, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Mvd+39+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Mvd+39+Img+2"], 1],
        ["Liceo n° 6", "liceo", "Paysandú", "Paysandú", -32.2689146, -58.0872964, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Pay+6+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Pay+6+Img+2"], 1],
        ["Liceo Fray Bentos n° 3", "liceo", "Río Negro", "Fray Bentos", -33.1309949, -58.2931204, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+FB+3+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+FB+3+Img+2"], 1],
        ["Liceo de Vichadero", "liceo", "Rivera", "Vichadero", -31.7781164, -54.6940085, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Vichadero+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Vichadero+Img+2"], 1],
        ["Liceo n° 3", "liceo", "Rivera", "Rivera", -30.908223, -55.5392777, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Riv+3+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Riv+3+Img+2"], 1],
        ["Liceo nº 3", "liceo", "Rocha", "Rocha", -34.6570757, -54.1564495, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Rocha+3+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Rocha+3+Img+2"], 1],
        ["Liceo de Delta del Tigre", "liceo", "Rocha", "Delta del Tigre", -34.7709297, -56.3619417, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Delta+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Delta+Img+2"], 1],
        ["Liceo Ansina", "liceo", "Tacuarembó", "Villa Ansina", -31.8778247, -55.4602326, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Ansina+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Ansina+Img+2"], 1],
        ["Liceo San Gregorio", "liceo", "Tacuarembó", "San Gregorio de Polanco", -32.6167481, -55.8358077, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+San+Gregorio+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+San+Gregorio+Img+2"], 1],
        ["Liceo n° 4", "liceo", "Tacuarembó", "Tacuarembó", -31.6992207, -55.9729938, "Liceo con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=Liceo+Tac+4+Img+1", "https://placehold.co/800x600/DDD/888?text=Liceo+Tac+4+Img+2"], 1],
  
        // UTUS
        ["Escuela Técnica Bella Unión", "utu", "Artigas", "Bella Unión", -30.25, -57.60, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Bella+Union+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Bella+Union+Img+2"], 1],
        ["Escuela Técnica Barros Blancos", "utu", "Canelones", "Barros Blancos", -34.7343945, -55.9785274, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+BB+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+BB+Img+2"], 1],
        ["Escuela Técnica Colonia Nicolich", "utu", "Canelones", "Colonia Nicolich", -34.8200833, -56.0198663, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Nicolich+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Nicolich+Img+2"], 1],
        ["Escuela Técnica Vista Linda", "utu", "Canelones", "Vista Linda", -34.6948555, -56.221418, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Vista+Linda+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Vista+Linda+Img+2"], 1],
        ["Escuela ANEXO Santa Ana Rio Branco", "utu", "Cerro Largo", "Rio Branco", -32.5959932, -53.379212, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Santa+Ana+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Santa+Ana+Img+2"], 1],
        ["Escuela Técnica Rio Branco", "utu", "Cerro Largo", "Rio Branco", -32.5978356, -53.3882808, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+RB+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+RB+Img+2"], 1],
        ["Escuela Técnica Superior Melo", "utu", "Cerro Largo", "Melo", -32.37, -54.17, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Melo+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Melo+Img+2"], 1],
        ["Escuela Técnica Carmelo", "utu", "Colonia", "Carmelo", -34.0047241, -58.2872218, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Carmelo+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Carmelo+Img+2"], 1],
        ["Escuela Técnica Nueva Palmira", "utu", "Colonia", "Nueva Palmira", -33.8735068, -58.4082019, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+N+Palmira+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+N+Palmira+Img+2"], 1],
        ["Escuela Técnica Superior Florida", "utu", "Florida", "Florida", -34.1019541, -56.216569, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Florida+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Florida+Img+2"], 1],
        ["Escuela Técnica José Pedro Varela", "utu", "Lavalleja", "José Pedro Varela", -33.4527748, -54.537886, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+JP+Varela+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+JP+Varela+Img+2"], 1],
        ["Escuela Técnica Minas", "utu", "Lavalleja", "Minas", -34.3731141, -55.2341705, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Minas+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Minas+Img+2"], 1],
        ["Escuela Técnica La Capuera", "utu", "Maldonado", "La Capuera", -34.8551908, -55.1065434, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Capuera+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Capuera+Img+2"], 1],
        ["C.E.C. Maldonado nuevo", "utu", "Maldonado", "Maldonado", -34.8931036, -54.9416291, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=CEC+Maldonado+Img+1", "https://placehold.co/800x600/DDD/888?text=CEC+Maldonado+Img+2"], 1],
        ["Escuela Técnica Cerro Pelado", "utu", "Maldonado", "Cerro Pelado", -34.8846015, -54.9758091, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Cerro+Pelado+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Cerro+Pelado+Img+2"], 1],
        ["Escuela Técnica Pan de Azúcar", "utu", "Maldonado", "Pan de Azúcar", -34.7714735, -55.2261942, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Pan+Azucar+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Pan+Azucar+Img+2"], 1],
        ["Escuela Técnica Malvin Norte", "utu", "Montevideo", "Malvin Norte", -34.8781312, -56.1233367, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Malvin+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Malvin+Img+2"], 1],
        ["Escuela Técnica Paso de la Arena", "utu", "Montevideo", "Paso de la Arena", -34.8438979, -56.2574089, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Paso+Arena+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Paso+Arena+Img+2"], 1],
        ["Escuela Técnica Villa Garcia", "utu", "Montevideo", "Villa Garcia", -34.805926, -56.0983072, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Villa+Garcia+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Villa+Garcia+Img+2"], 1],
        ["Escuela Técnica Superior Rivera", "utu", "Rivera", "Rivera", -30.9008843, -55.5496404, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Rivera+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Rivera+Img+2"], 1],
        ["Escuela Técnica Tranqueras", "utu", "Rivera", "Tranqueras", -31.1983778, -55.7543616, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Tranqueras+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Tranqueras+Img+2"], 1],
        ["Escuela Técnica Rocha", "utu", "Rocha", "Rocha", -34.4806666, -54.3320012, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Rocha+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Rocha+Img+2"], 1],
        ["Escuela Técnica Belén", "utu", "Salto", "Belén", -30.65, -57.78, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Belen+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Belen+Img+2"], 1],
        ["Escuela Técnica Zitarrosa", "utu", "Rocha", "Rocha", -34.48, -54.33, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Zitarrosa+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Zitarrosa+Img+2"], 1],
        ["Escuela Técnica Cardona", "utu", "Soriano", "Cardona", -33.88, -57.38, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Cardona+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Cardona+Img+2"], 1],
        ["Escuela Ciclo Básico \"W. Lockhart\"", "utu", "Soriano", "Mercedes", -33.25, -58.03, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Lockhart+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Lockhart+Img+2"], 1],
        ["Escuela Agraria Caraguatá (Anexo)", "utu", "Tacuarembó", "Caraguatá", -32.233314, -54.9936327, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Caraguata+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Caraguata+Img+2"], 1],
        ["Escuela Técnica Paso de los toros", "utu", "Tacuarembó", "Paso de los Toros", -32.8126888, -56.5066243, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Paso+Toros+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Paso+Toros+Img+2"], 1],
        ["Escuela Técnica Superior Tacuarembó", "utu", "Tacuarembó", "Tacuarembó", -31.7133042, -55.9894886, "UTU con comedor-cocina.", ["https://placehold.co/800x600/EEE/999?text=UTU+Tacuarembo+Img+1", "https://placehold.co/800x600/DDD/888?text=UTU+Tacuarembo+Img+2"], 1],
      ];
  
      let insertedCount = 0;
      data.forEach(inst => {
        seed.run(inst[0], inst[1], inst[2], inst[3], inst[4], inst[5], inst[6], JSON.stringify(inst[7]), inst[8]);
        insertedCount++;
      });
      console.log(`Database seeded successfully with ${insertedCount} institutions.`);
    } else {
      console.log(`Database already has ${count.count} institutions. Skipping seed.`);
    }
  } catch (err) {
    console.error("Database initialization error:", err);
  }

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API Routes - Return lightweight data for the initial list to improve performance
  app.get("/api/institutions", (req, res) => {
    try {
      // Select only necessary fields for the map and list view
      // We include only the first image for the list view thumbnails
      const institutions = db.prepare("SELECT id, name, type, department, address, lat, lng, hasDiningRoom, images FROM institutions").all();
      res.json(institutions.map((inst: any) => {
        const allImages = JSON.parse(inst.images || "[]");
        return {
          ...inst,
          images: allImages.length > 0 ? [allImages[0]] : [], // Only send the first image
          hasDiningRoom: !!inst.hasDiningRoom
        };
      }));
    } catch (err) {
      console.error("Error fetching institutions:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Full details for a specific institution
  app.get("/api/institutions/:id", (req, res) => {
    try {
      const { id } = req.params;
      const inst: any = db.prepare("SELECT * FROM institutions WHERE id = ?").get(id);
      if (!inst) return res.status(404).json({ error: "Not found" });
      
      res.json({
        ...inst,
        images: JSON.parse(inst.images || "[]"),
        hasDiningRoom: !!inst.hasDiningRoom
      });
    } catch (err) {
      console.error("Error fetching institution details:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/institutions", (req, res) => {
    try {
      const { name, type, department, address, lat, lng, description, images, hasDiningRoom } = req.body;
      const info = db.prepare(`
        INSERT INTO institutions (name, type, department, address, lat, lng, description, images, hasDiningRoom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, type, department, address, lat, lng, description, JSON.stringify(images || []), hasDiningRoom ? 1 : 0);
      res.json({ id: info.lastInsertRowid });
    } catch (err) {
      console.error("Error creating institution:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/institutions/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { name, type, department, address, lat, lng, description, images, hasDiningRoom } = req.body;
      db.prepare(`
        UPDATE institutions 
        SET name = ?, type = ?, department = ?, address = ?, lat = ?, lng = ?, description = ?, images = ?, hasDiningRoom = ?
        WHERE id = ?
      `).run(name, type, department, address, lat, lng, description, JSON.stringify(images || []), hasDiningRoom ? 1 : 0, id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating institution:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/institutions/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM institutions WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting institution:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/institutions/full", (req, res) => {
    try {
      const institutions = db.prepare("SELECT * FROM institutions").all();
      res.json(institutions.map((inst: any) => ({
        ...inst,
        images: JSON.parse(inst.images || "[]"),
        hasDiningRoom: !!inst.hasDiningRoom
      })));
    } catch (err) {
      console.error("Error fetching full institutions:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/sync", async (req, res) => {
    let { sourceUrl } = req.body;
    if (!sourceUrl) return res.status(400).json({ error: "Source URL required" });

    // Normalize URL: remove trailing slash and ensure protocol
    sourceUrl = sourceUrl.replace(/\/$/, "");
    if (!sourceUrl.startsWith("http")) {
      sourceUrl = `https://${sourceUrl}`;
    }

    try {
      console.log(`Starting sync from ${sourceUrl}...`);
      
      const fetchOptions = {
        headers: {
          'User-Agent': 'EduMap-Sync-Tool/1.0',
          'Accept': 'application/json'
        }
      };

      // Try /full first
      console.log(`Attempting fetch from ${sourceUrl}/api/institutions/full`);
      const response = await fetch(`${sourceUrl}/api/institutions/full`, fetchOptions);
      
      if (!response.ok) {
        console.log(`/api/institutions/full failed with ${response.status}. Falling back to /api/institutions...`);
        const listRes = await fetch(`${sourceUrl}/api/institutions`, fetchOptions);
        
        if (!listRes.ok) {
          const errorText = await listRes.text().catch(() => "No error body");
          console.error(`Failed to fetch list from ${sourceUrl}/api/institutions. Status: ${listRes.status}. Body: ${errorText}`);
          throw new Error(`Failed to fetch list: ${listRes.status} ${listRes.statusText}`);
        }
        
        const list = await listRes.json();
        console.log(`Fetched list of ${list.length} institutions. Starting individual fetches...`);
        
        db.prepare("DELETE FROM institutions").run();
        let count = 0;
        for (const item of list) {
          console.log(`Fetching details for ID ${item.id}...`);
          const detailRes = await fetch(`${sourceUrl}/api/institutions/${item.id}`, fetchOptions);
          if (detailRes.ok) {
            const fullData = await detailRes.json();
            db.prepare(`
              INSERT INTO institutions (name, type, department, address, lat, lng, description, images, hasDiningRoom)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              fullData.name, fullData.type, fullData.department, fullData.address, 
              fullData.lat, fullData.lng, fullData.description, 
              JSON.stringify(fullData.images || []), fullData.hasDiningRoom ? 1 : 0
            );
            count++;
          } else {
            console.warn(`Failed to fetch details for ID ${item.id}: ${detailRes.status}`);
          }
        }
        return res.json({ success: true, count });
      }
      
      const institutions = await response.json();
      console.log(`Fetched ${institutions.length} institutions from /full endpoint.`);
      
      const insert = db.prepare(`
        INSERT INTO institutions (name, type, department, address, lat, lng, description, images, hasDiningRoom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const syncTransaction = db.transaction((data) => {
        db.prepare("DELETE FROM institutions").run();
        for (const inst of data) {
          insert.run(
            inst.name, inst.type, inst.department, inst.address, 
            inst.lat, inst.lng, inst.description, 
            JSON.stringify(inst.images || []), inst.hasDiningRoom ? 1 : 0
          );
        }
      });

      syncTransaction(institutions);
      res.json({ success: true, count: institutions.length });
    } catch (err) {
      console.error("Sync error:", err);
      res.status(500).json({ 
        error: err instanceof Error ? err.message : "Sync failed",
        details: String(err)
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite in middleware mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});

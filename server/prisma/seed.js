import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MODELES = [
  ["Oumaima", "oumaima", "Gérante", "Direction", ["Direction"], [], { voir: 1, ajouter: 1, modifier: 1, supprimer: 1, valider: 1, exporter: 1 }],
  ["Imane", "imane", "Transport international & Études", "Opérations Internationales", ["Transport", "Études & Chiffrage"], ["transports", "transportsNat", "etudes", "documents", "taches", "dossiers"], { voir: 1, ajouter: 1, modifier: 1 }],
  ["Mansouri", "mansouri", "Closing & Suivi Client", "Commercial", ["Closing", "Suivi Client"], ["offres", "reclamations", "clients", "dossiers", "taches", "documents"], { voir: 1, ajouter: 1, modifier: 1, valider: 1 }],
  ["Ouiam", "ouiam", "Data & Demandes", "Commercial", ["Data"], ["demandes", "clients", "contacts", "dossiers", "taches"], { voir: 1, ajouter: 1, modifier: 1, valider: 1 }],
  ["Zoubida", "zoubida", "Analyse, Transit & Certification", "Opérations Internationales", ["Analyse Dossiers", "Transit & Douane"], ["analyses", "transits", "certifs", "documents", "dossiers", "taches"], { voir: 1, ajouter: 1, modifier: 1, valider: 1 }],
  ["Yasser", "yasser", "Sourcing & PortNet", "Études Commerciales", ["Sourcing", "Transit & Douane"], ["sourcings", "fournisseurs", "produits", "transits", "documents", "dossiers", "taches"], { voir: 1, ajouter: 1, modifier: 1 }],
  ["Mohammed Digital", "mohammed", "Digital", "Digital", ["Digital", "Data"], ["leads", "taches"], { voir: 1, ajouter: 1, modifier: 1 }],
  ["Nisrine", "nisrine", "Documents & Stockage", "Administration", [], ["documents", "stockage", "taches", "dossiers"], { voir: 1, ajouter: 1, modifier: 1 }]
];

async function main() {
  console.log("🌱 Seeding default users into PostgreSQL...");
  let count = 0;
  for (let i = 0; i < MODELES.length; i++) {
    const m = MODELES[i];
    const code = "USR" + String(i + 1).padStart(6, "0");
    const identifiant = m[1];
    
    const existing = await prisma.user.findFirst({
      where: { OR: [{ identifiant }, { code }] }
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          code,
          identifiant,
          nomComplet: m[0],
          motDePasse: "ubos2026",
          role: m[3] === "Direction" ? "ADMIN" : "USER",
          service: m[3],
          actif: true,
          modulesAutorises: { services: m[4], modules: m[5], poste: m[2], departement: m[3] },
          permissions: m[6]
        }
      });
      count++;
    }
  }
  console.log(`✅ Seed finished: ${count} users created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

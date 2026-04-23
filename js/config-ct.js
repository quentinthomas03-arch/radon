export const CONFIG_CT = {
  type:'CT', label:'Code du Travail',
  entree:{sections:[{
    id:'mission', title:'Mission',
    fields:[
      {id:'etab_nom',           label:'Nom du client / établissement',      type:'text',   required:true,  excelCell:'F15'},
      {id:'intervenant',        label:'Intervenant sur site',               type:'text',   required:true,  excelCell:'C11'},
      {id:'type_depistage',     label:'Type de dépistage',                 type:'select', required:true,  excelCell:'C13',
        options:['Dépistage initial',"Contrôle d'efficacité suite à la mise en place d'actions correctives simples"]},
      {id:'date_intervention',  label:"Date(s) d'intervention",            type:'text',   required:true,  excelCell:'C12', hint:'Ex : 15/01/2025 ; 15/04/2025'},
      {id:'nb_dosimetres_prevu',label:'Nombre de dosimètres (stratégie)',  type:'number', required:true,  excelCell:'C23'},
      {id:'nb_plans',           label:'Nombre de plans de bâtiment',       type:'number', required:false, excelCell:null, default:1,
        hint:'Génère les onglets Plan 1, Plan 2…'},
    ]
  }]},
  tableau:{
    niveaux:['batiment','zcs','point'],
    batiment:{label:'Bâtiment',fields:[
      {id:'nom',               label:'Bâtiment',                           type:'text',   required:true,  excelCol:'C'},
      {id:'annee_construction',label:'Année de construction',              type:'select', required:false, excelCol:'E',
        options:['Avant 1949','De 1949 à 1975','De 1975 à 2000','Après 2000']},
      {id:'materiau',          label:'Matériau de construction principal', type:'select', required:false, excelCol:'F',
        options:['Béton plein','Béton creux (parpaing)','Brique','Pierre','Bois','Métal','Autre']},
    ]},
    zcs:{label:'Zone à Caractéristiques Similaires (ZCS)',fields:[
      {id:'nom',          label:'N° ZCS',               type:'text',   required:true,  excelCol:'D'},
      {id:'niveau',       label:'Niveau de la ZCS',     type:'select', required:false, excelCol:'G',
        options:['Sous-sol','Rez-de-chaussée','1er étage','2ème étage','3ème étage et plus']},
      {id:'activite',     label:'Activité professionnelle', type:'select', required:false, excelCol:'H',
        options:['Bureau / Administration','Atelier de production','Entrepôt / Stockage','Commerce / Vente','Enseignement','Santé / Soins','Restauration','Hébergement','Activité sportive','Cave / Cavité naturelle','Station thermale / Spa','Garage / Réparation automobile','Laboratoire','Autre']},
      {id:'interface_sol',label:'Interface sol/bâtiment',type:'select', required:false, excelCol:'I',
        options:['Dallage ou plancher sur terre-plein','Vide sanitaire ventilé','Vide sanitaire non ventilé','Cave ou sous-sol : ventilé','Cave ou sous-sol : non ventilé','Bâtiment sur cave ou sous-sol','Plancher sur local non chauffé','Autre']},
      {id:'ventilation',  label:'Ventilation',           type:'select', required:false, excelCol:'J',
        options:["Aucune","Naturelle par ouvrants","Naturelle par entrées d'air","VMC Simple flux","VMC Double flux","CTA","Autre"]},
      {id:'temperature',  label:'Température',           type:'select', required:false, excelCol:'K',
        options:['< Température Ambiante','Température Ambiante','> Température Ambiante']},
      {id:'surface_sol',  label:'Surface au sol (m²)',   type:'number', required:false, excelCol:'L'},
    ]},
    // NOTE : le champ nb_detecteur a été retiré de la saisie terrain.
    // Comme chaque clic sur le plan = 1 capteur, la valeur est toujours 1
    // et l'export (export.js) l'écrit directement en dur dans la colonne M.
    point:{label:'Point de mesure',fields:[
      {id:'num_detecteur', label:'N° Détecteur',                          type:'text',   required:true,  excelCol:'N', phase:'terrain', numeric:true},
      {id:'lieu_pose',     label:'Lieu de pose',                          type:'text',   required:true,  excelCol:'O', phase:'terrain'},
      {id:'type_fenetres', label:'Type de fenêtres',                      type:'select', required:false, excelCol:'P', phase:'terrain',
        options:["Simple vitrage","Double vitrage structure bois","Double vitrage structure PVC","Double vitrage structure aluminium","Triple vitrage","Absence d'ouvrants","Autre"]},
      {id:'surface_piece', label:'Surface de la pièce instrumentée (m²)', type:'number', required:false, excelCol:'Q', phase:'terrain'},
      {id:'date_pose',     label:'Date de pose',                          type:'date',   required:true,  excelCol:'R', phase:'terrain'},
      {id:'date_depose',   label:'Date de dépose',                        type:'date',   required:false, excelCol:'S', phase:'terrain'},
      {id:'dosimetre_perdu',label:'Dosimètre perdu ou détérioré',         type:'select', required:false, excelCol:'V', phase:'resultats', options:['NON','OUI']},
      {id:'activite_bqm3', label:'Activité volumique (Bq/m³) (k=2)',      type:'number', required:false, excelCol:'W', phase:'resultats'},
      {id:'incertitude',   label:'Incertitude',                           type:'number', required:false, excelCol:'X', phase:'resultats'},
    ]},
    computed:[
      {id:'duree_pose',  label:'Durée totale de pose (jours)',                    excelCol:'T'},
      {id:'activite_moy',label:'Activité volumique moyenne attribuée à la zone',  excelCol:'Y'},
    ],
  },
  seuils:{reference:300,couleurs:{vert:{max:300,label:'< 300 Bq/m³',color:'#27ae60'},orange:{max:1000,label:'300–1000 Bq/m³',color:'#f39c12'},rouge:{min:1000,label:'≥ 1000 Bq/m³',color:'#e74c3c'}}},
  export:{filename:'Radon_CT_{dossier}_{date}.xlsx',sheets:{entree:{name:'Entrée'},tableau:{name:'Tableau',startRow:2}}},
};

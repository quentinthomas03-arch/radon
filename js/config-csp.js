export const CONFIG_CSP = {
  type:'CSP', label:'Code de la Santé Publique',
  entree:{sections:[{
    id:'mission', title:'Mission',
    fields:[
      {id:'etab_nom',           label:'Nom du client / établissement',      type:'text',   required:true,  excelCell:'F16'},
      {id:'intervenant',        label:'Intervenant sur site',               type:'text',   required:true,  excelCell:'C12'},
      {id:'type_depistage',     label:'Type de dépistage',                 type:'select', required:true,  excelCell:'C14',
        options:['Dépistage initial','Dépistage décennal',"Contrôle d'efficacité suite à mise en place d'actions correctives simples","Contrôle d'efficacité suite à réalisation d'actions de remédiations"]},
      {id:'date_intervention',  label:"Date(s) d'intervention",            type:'text',   required:true,  excelCell:'C13', hint:'Ex : 14/01/2025 ; 14/04/2025'},
      {id:'nb_dosimetres_prevu',label:'Nombre de dosimètres (stratégie)',  type:'number', required:true,  excelCell:null},
      {id:'nb_plans',           label:'Nombre de plans de bâtiment',       type:'number', required:false, excelCell:null, default:1,
        hint:'Génère les onglets Plan 1, Plan 2…'},
    ]
  }]},
  tableau:{
    niveaux:['batiment','zone_homogene','point'],
    batiment:{label:'Bâtiment',fields:[
      {id:'nom',               label:'Bâtiment',                           type:'text',   required:true,  excelCol:'C'},
      {id:'annee_construction',label:'Année de construction',              type:'select', required:false, excelCol:'E',
        options:['Avant 1949','De 1949 à 1975','De 1975 à 2000','Après 2000']},
      {id:'materiau',          label:'Matériau de construction principal', type:'select', required:false, excelCol:'F',
        options:['Béton plein','Béton creux (parpaing)','Brique','Pierre','Bois','Métal','Autre']},
    ]},
    zone_homogene:{label:'Zone Homogène',fields:[
      {id:'numero',      label:'N° Zone Homogène',       type:'text',   required:true,  excelCol:'D'},
      {id:'niveau',      label:'Niveau',                 type:'select', required:false, excelCol:'G',
        options:['Sous-sol','Rez-de-chaussée','1er étage','2ème étage','3ème étage et plus']},
      {id:'usage',       label:'Usage',                  type:'text',   required:false, excelCol:'H'},
      {id:'interface_sol',label:'Interface sol/bâtiment',type:'select', required:false, excelCol:'I',
        options:['Dallage ou plancher sur terre-plein','Vide sanitaire ventilé','Vide sanitaire non ventilé','Cave ou sous-sol : ventilé','Cave ou sous-sol : non ventilé','Bâtiment sur cave ou sous-sol','Plancher sur local non chauffé','Autre']},
      {id:'ventilation', label:'Ventilation',            type:'select', required:false, excelCol:'J',
        options:["Aucune","Naturelle par ouvrants","Naturelle par entrées d'air","VMC Simple flux","VMC Double flux","CTA","Autre"]},
      {id:'surface_sol', label:'Surface au sol (m²)',    type:'number', required:false, excelCol:'K'},
    ]},
    point:{label:'Point de mesure',fields:[
      {id:'num_dosimetrie',label:'N° Dosimétrie',                        type:'text',   required:true,  excelCol:'L', phase:'terrain'},
      {id:'nom_piece',     label:'Nom de la pièce instrumentée',         type:'text',   required:true,  excelCol:'M', phase:'terrain'},
      {id:'surface_piece', label:'Surface de la pièce (m²)',             type:'number', required:false, excelCol:'N', phase:'terrain'},
      {id:'date_pose',     label:'Date de pose',                         type:'date',   required:true,  excelCol:'O', phase:'terrain'},
      {id:'date_depose',   label:'Date de dépose',                       type:'date',   required:false, excelCol:'P', phase:'terrain'},
      {id:'dosimetre_perdu',label:'Dosimètre perdu ou détérioré',        type:'select', required:false, excelCol:'S', phase:'resultats', options:['NON','OUI']},
      {id:'concentration', label:'Concentration (Bq/m³) (k=2)',          type:'number', required:false, excelCol:'T', phase:'resultats'},
      {id:'incertitude',   label:'Incertitude',                          type:'number', required:false, excelCol:'U', phase:'resultats'},
    ]},
    computed:[
      {id:'duree_pose',label:'Durée totale de pose (jours)', excelCol:'Q'},
      {id:'conc_moy',  label:'Concentration moyenne de la zone',         excelCol:'V'},
    ],
  },
  seuils:{reference:300,couleurs:{vert:{max:300,label:'< 300 Bq/m³',color:'#27ae60'},orange:{max:1000,label:'300–1000 Bq/m³',color:'#f39c12'},rouge:{min:1000,label:'≥ 1000 Bq/m³',color:'#e74c3c'}}},
  export:{filename:'Radon_CSP_{dossier}_{date}.xlsx',sheets:{entree:{name:'Entrée'},tableau:{name:'Tableau',startRow:2}}},
};

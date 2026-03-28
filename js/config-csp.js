// ============================================================
// config-csp.js — Configuration Code de la Santé Publique (CSP)
// Champs identiques à la macro HCBD CSP V20
// ============================================================

export const CONFIG_CSP = {
  type: 'CSP',
  label: 'Code de la Santé Publique',
  description: 'Mesurage radon — ERP (R.1333-33 et suivants)',

  // ── ONGLET ENTRÉE ──────────────────────────────────────────
  entree: {
    sections: [
      {
        id: 'info_socotec',
        title: 'Information Organisme',
        fields: [
          { id: 'numero_dossier',    label: 'Numéro de dossier',               type: 'text',   required: true,  excelCell: 'C5'  },
          { id: 'auteur_rapport',    label: 'Auteur du rapport',                type: 'text',   required: true,  excelCell: 'C6'  },
          { id: 'tel_auteur',        label: "Tél de l'auteur",                  type: 'tel',    required: false, excelCell: 'C7'  },
          { id: 'mail_auteur',       label: "Mail de l'auteur",                 type: 'email',  required: false, excelCell: 'C8'  },
          { id: 'date_finalisation', label: 'Date de finalisation du rapport',  type: 'date',   required: false, excelCell: 'C9'  },
        ]
      },
      {
        id: 'depistage_initial',
        title: 'Dépistage initial (cas contrôle d\'efficacité / décennal)',
        collapsible: true,
        fields: [
          { id: 'date_envoi_initial',   label: "Date d'envoi du rapport de dépistage initial",   type: 'date',   required: false, excelCell: 'C10' },
          { id: 'resultat_initial',     label: 'Résultat du dépistage initial',                  type: 'select', required: false, excelCell: 'C11',
            options: [
              "L'ensemble des résultats attribués aux zones homogènes sont < 300 Bq/m³",
              "Au moins l'un des résultats attribué à une zone homogène est ≥ 300 Bq/m³",
            ]
          },
          { id: 'date_interv_initial',  label: "Date d'intervention du dépistage initial",       type: 'text',   required: false, excelCell: 'C12', hint: 'Ex : 25/01/2024 ; 03/04/2024' },
          { id: 'chrono_initial',       label: 'N° de Chrono du dépistage initial',              type: 'text',   required: false, excelCell: 'C13' },
        ]
      },
      {
        id: 'adresse_agence',
        title: 'Adresse Agence Intervenante',
        fields: [
          { id: 'agence_nom',     label: "Agence de l'auteur",       type: 'text', required: false, excelCell: 'F5'  },
          { id: 'agence_adr1',    label: 'Adresse (ligne 1)',        type: 'text', required: false, excelCell: 'F7'  },
          { id: 'agence_adr2',    label: 'Adresse (ligne 2)',        type: 'text', required: false, excelCell: 'F8'  },
          { id: 'agence_cp',      label: 'Code Postal',              type: 'text', required: false, excelCell: 'F9'  },
          { id: 'agence_ville',   label: 'Ville',                    type: 'text', required: false, excelCell: 'F10' },
          { id: 'agence_tel',     label: "Tél. de l'agence",         type: 'tel',  required: false, excelCell: 'F11' },
          { id: 'agence_fax',     label: "Fax de l'agence",          type: 'text', required: false, excelCell: 'F12' },
        ]
      },
      {
        id: 'intervention',
        title: 'Intervention',
        fields: [
          { id: 'intervenant',       label: 'Intervenant sur site',     type: 'text',   required: true,  excelCell: 'C12' },
          { id: 'date_intervention', label: "Date d'intervention",     type: 'text',   required: true,  excelCell: 'C13', hint: 'Ex : 14/01/2025 ; 14/04/2025' },
          { id: 'type_depistage',    label: 'Type de dépistage',       type: 'select', required: true,  excelCell: 'C14',
            options: [
              'Dépistage initial',
              'Dépistage décennal',
              "Contrôle d'efficacité suite à mise en place d'actions correctives simples",
              "Contrôle d'efficacité suite à réalisation d'actions de remédiations",
            ]
          },
          { id: 'numero_chrono',    label: 'N° de Chrono',              type: 'text',   required: true,  excelCell: 'C15' },
          { id: 'version',          label: 'Version',                   type: 'number', required: false, excelCell: 'C16', default: 1 },
          { id: 'nature_revision',  label: 'Nature de révision',        type: 'text',   required: false, excelCell: 'C17', default: '/' },
        ]
      },
      {
        id: 'info_etablissement',
        title: 'Information Établissement',
        fields: [
          { id: 'etab_nom',     label: "Nom de l'établissement",  type: 'text', required: true,  excelCell: 'F16' },
          { id: 'etab_adr1',    label: 'Adresse',                 type: 'text', required: false, excelCell: 'F17' },
          { id: 'etab_adr2',    label: 'Adresse (2)',              type: 'text', required: false, excelCell: 'F18' },
          { id: 'etab_cp',      label: 'Code Postal',              type: 'text', required: false, excelCell: 'F18' },
          { id: 'etab_commune', label: 'Commune',                  type: 'text', required: false, excelCell: 'F19' },
          { id: 'etab_email',   label: 'E-mail',                   type: 'email',required: false, excelCell: 'F20' },
          { id: 'etab_tel',     label: 'Tél',                      type: 'tel',  required: false, excelCell: 'F21' },
        ]
      },
      {
        id: 'autres',
        title: 'Autres informations',
        fields: [
          { id: 'code_ape',        label: 'Code APE',          type: 'select', required: false, excelCell: 'I3',
            options: [
              '8510Z (Enseignement pré-primaire)',
              '8520Z (Enseignement primaire)',
              '8531Z (Enseignement secondaire général)',
              '8532Z (Enseignement secondaire technique ou professionnel)',
              '8541Z (Enseignement post-secondaire non supérieur)',
              '8610Z (Activités hospitalières)',
              '8710A (Hébergement médicalisé pour personnes âgées)',
              '8710B (Hébergement médicalisé pour enfants handicapés)',
              '8710C (Hébergement médicalisé pour adultes handicapés)',
              '8720A (Hébergement social pour handicapés mentaux)',
              '8720B (Hébergement social pour toxicomanes)',
              '8730A (Hébergement social pour personnes âgées)',
              '8730B (Hébergement social pour handicapés physiques)',
              '8790A (Hébergement social pour enfants en difficultés)',
              '8790B (Hébergement social pour adultes et familles en difficultés)',
              '8891A (Accueil de jeunes enfants)',
              '8891B (Accueil ou accompagnement sans hébergement d\'enfants handicapés)',
              '8899A (Autre accueil ou accompagnement d\'enfants et d\'adolescents)',
              '9604Z (Entretien corporel)',
              '8423Z (Justice)',
            ]
          },
          { id: 'numero_finess',   label: 'Numéro FINESS',     type: 'text',   required: false, excelCell: 'I4' },
          { id: 'code_uai',        label: 'Code UAI',           type: 'text',   required: false, excelCell: 'I5' },
        ]
      },
      {
        id: 'nb_dosimetres',
        title: 'Stratégie',
        fields: [
          { id: 'nb_dosimetres_prevu', label: "Nombre de dosimètres prévu (d'après la stratégie)", type: 'number', required: true, excelCell: 'C24' },
        ]
      },
      {
        id: 'info_proprietaire',
        title: 'Information Propriétaire / Gestionnaire',
        fields: [
          { id: 'ipg_entreprise',    label: "Nom de l'entreprise",           type: 'text',   required: false, excelCell: 'C27' },
          { id: 'ipg_civilite',      label: 'Monsieur / Madame',             type: 'select', required: false, excelCell: 'C29',
            options: ['Monsieur', 'Madame']
          },
          { id: 'ipg_nom',           label: "Nom de l'interlocuteur",        type: 'text',   required: false, excelCell: 'C30' },
          { id: 'ipg_prenom',        label: "Prénom de l'interlocuteur",     type: 'text',   required: false, excelCell: 'C31' },
          { id: 'ipg_fonction',      label: "Fonction de l'interlocuteur",   type: 'text',   required: false, excelCell: 'C32' },
          { id: 'ipg_mail',          label: "Mail de l'interlocuteur",       type: 'email',  required: false, excelCell: 'C33' },
          { id: 'ipg_tel',           label: 'Tél (standard)',                type: 'tel',    required: false, excelCell: 'C34' },
          { id: 'ipg_adr1',          label: 'Adresse (1)',                   type: 'text',   required: false, excelCell: 'C36' },
          { id: 'ipg_adr2',          label: 'Adresse (2)',                   type: 'text',   required: false, excelCell: 'C37' },
          { id: 'ipg_adr3',          label: 'Adresse (3)',                   type: 'text',   required: false, excelCell: 'C38' },
          { id: 'ipg_cp',            label: 'Code Postal',                   type: 'text',   required: false, excelCell: 'C39' },
          { id: 'ipg_commune',       label: 'Commune',                       type: 'text',   required: false, excelCell: 'C40' },
        ]
      },
      {
        id: 'info_donneur_ordre',
        title: "Information Donneur d'ordre",
        fields: [
          { id: 'ido_entreprise',    label: "Nom de l'entreprise",           type: 'text',   required: false, excelCell: 'F27' },
          { id: 'ido_civilite',      label: 'Monsieur / Madame',             type: 'select', required: false, excelCell: 'F29',
            options: ['Monsieur', 'Madame']
          },
          { id: 'ido_nom',           label: "Nom de l'interlocuteur",        type: 'text',   required: false, excelCell: 'F30' },
          { id: 'ido_prenom',        label: "Prénom de l'interlocuteur",     type: 'text',   required: false, excelCell: 'F31' },
          { id: 'ido_adr1',          label: 'Adresse (1)',                   type: 'text',   required: false, excelCell: 'F36' },
          { id: 'ido_adr2',          label: 'Adresse (2)',                   type: 'text',   required: false, excelCell: 'F37' },
          { id: 'ido_adr3',          label: 'Adresse (3)',                   type: 'text',   required: false, excelCell: 'F38' },
          { id: 'ido_cp',            label: 'Code Postal',                   type: 'text',   required: false, excelCell: 'F39' },
          { id: 'ido_commune',       label: 'Commune',                       type: 'text',   required: false, excelCell: 'F40' },
        ]
      },
    ],
  },

  // ── ONGLET TABLEAU — Colonnes de mesure (CSP) ─────────────
  tableau: {
    // Hiérarchie : Bâtiment > Zone Homogène > Point de mesure
    niveaux: ['batiment', 'zone_homogene', 'point'],

    // Champs du bâtiment
    batiment: {
      label: 'Bâtiment',
      fields: [
        { id: 'nom',                  label: 'Bâtiment',                                     type: 'text',   required: true,  excelCol: 'C' },
        { id: 'nb_salles',            label: 'Nombre de salles',                              type: 'number', required: false, excelCol: 'D' },
        { id: 'surface_sol',          label: 'Surface au sol (m²)',                            type: 'number', required: false, excelCol: 'E' },
        { id: 'periode_construction', label: 'Période de construction',                       type: 'select', required: false, excelCol: 'F',
          options: [
            'Avant 1949',
            'De 1949 à 1975',
            'De 1975 à 2000',
            'Après 2000',
          ]
        },
        { id: 'nb_niveaux',           label: 'Nombres de niveaux du bâtiment',                type: 'select', required: false, excelCol: 'G',
          options: [
            '1 niveau',
            '2 niveaux',
            '3 niveaux ou plus',
          ]
        },
        { id: 'niveau_bas_occupe',    label: 'Niveau le plus bas occupé',                     type: 'select', required: false, excelCol: 'H',
          options: [
            'Sous-sol',
            'Rez-de-chaussée',
            '1er étage',
          ]
        },
        { id: 'interface_sol',        label: 'Interface avec le sol',                          type: 'select', required: false, excelCol: 'I',
          options: [
            'Dallage ou plancher sur terre-plein',
            'Vide sanitaire ventilé',
            'Vide sanitaire non ventilé',
            'Cave ou sous-sol : ventilé',
            'Cave ou sous-sol : non ventilé',
            'Bâtiment sur cave ou sous-sol',
            'Plancher sur local non chauffé',
            'Dallage ou plancher sur terre-plein\nBâtiment sur cave ou sous-sol',
            'Autre',
          ]
        },
        { id: 'materiau',             label: 'Matériau de construction principal (murs porteurs)', type: 'select', required: false, excelCol: 'J',
          options: [
            'Béton plein',
            'Béton creux (parpaing)',
            'Brique',
            'Pierre',
            'Bois',
            'Métal',
            'Autre',
          ]
        },
      ]
    },

    // Champs de la Zone Homogène (ZH)
    zone_homogene: {
      label: 'Zone Homogène',
      fields: [
        { id: 'numero',               label: 'N° Zone Homogène',                               type: 'text',   required: true,  excelCol: 'K' },
        { id: 'superficie',           label: 'Superficie (m²)',                                 type: 'number', required: false, excelCol: 'L' },
        { id: 'nb_pieces',            label: 'Nombres de pièces dans cette zone',               type: 'number', required: false, excelCol: 'M' },
        { id: 'nb_pieces_occupees',   label: 'Nombres de pièces occupées',                      type: 'number', required: false, excelCol: 'N' },
        { id: 'nb_dispositifs',       label: 'Nombre de dispositifs de mesures',                 type: 'number', required: false, excelCol: 'O' },
        { id: 'niveau_etage',         label: 'Niveau de la zone homogène (étage)',               type: 'select', required: false, excelCol: 'P',
          options: [
            'Sous-sol',
            'Rez-de-chaussée',
            '1er étage',
            '2ème étage',
            '3ème étage et plus',
          ]
        },
        { id: 'entrees_air_zone',     label: "Entrées et sorties d'air de la zone",             type: 'select', required: false, excelCol: 'Q',
          options: [
            "Entrées d'air en façade de la zone",
            "Entrées d'air en façade de la zone\nBouches d'extraction mécanique d'air de la zone",
            "Bouches d'extraction mécanique d'air de la zone",
            "Entrées d'air en façade de la zone\nBouches de soufflage mécanique d'air de la zone",
            "Aucune entrée d'air identifiée",
            'Autre',
          ]
        },
        { id: 'interface_sol_zone',   label: 'Interface de la zone avec le sol',                 type: 'select', required: false, excelCol: 'R',
          options: [
            'Dallage ou plancher sur terre-plein',
            'Vide sanitaire ventilé',
            'Vide sanitaire non ventilé',
            'Cave ou sous-sol : ventilé',
            'Cave ou sous-sol : non ventilé',
            'Plancher sur local non chauffé',
            'Autre',
          ]
        },
        { id: 'temperature',          label: 'Température Ambiante',                             type: 'select', required: false, excelCol: 'S',
          options: [
            '< Température Ambiante',
            '= température ambiante',
            '> Température Ambiante',
          ]
        },
      ]
    },

    // Champs du point de mesure (1 dosimètre dans 1 pièce)
    point: {
      label: 'Point de mesure',
      fields: [
        // ── Terrain (pose) ──
        { id: 'nom_piece',          label: 'Nom de la pièce mesurée (utilisation)',    type: 'text',   required: true,  excelCol: 'T', phase: 'terrain' },
        { id: 'superficie_piece',   label: 'Superficie de la pièce mesurée (m²)',      type: 'number', required: false, excelCol: 'U', phase: 'terrain' },
        { id: 'utilisation',        label: 'Utilisation de la pièce',                  type: 'select', required: false, excelCol: 'V', phase: 'terrain',
          options: [
            'Très fréquente',
            'Fréquente',
            'Occasionnelle',
            'Rare',
          ]
        },
        { id: 'type_fenetres',     label: 'Composition des fenêtres',                 type: 'select', required: false, excelCol: 'W', phase: 'terrain',
          options: [
            'Simple vitrage structure bois',
            'Double vitrage structure bois',
            'Double vitrage structure PVC',
            'Double vitrage structure aluminium',
            'Triple vitrage',
            "Absence d'ouvrants",
            'Autre',
          ]
        },
        { id: 'niveau_piece',      label: 'Niveau de la pièce',                        type: 'select', required: false, excelCol: 'X', phase: 'terrain',
          options: [
            'Sous-Sol',
            'Rez-de-chaussée',
            '1er étage',
            '2ème étage',
            '3ème étage et plus',
          ]
        },
        { id: 'aeration',          label: 'Aération par ouverture des fenêtres',        type: 'select', required: false, excelCol: 'Y', phase: 'terrain',
          options: [
            'Très fréquente',
            'Fréquente',
            'Faible',
            'Aucune',
          ]
        },
        { id: 'entrees_air_piece', label: "Entrées et sorties d'air de la pièce",       type: 'select', required: false, excelCol: 'Z', phase: 'terrain',
          options: [
            "Entrée d'air en façade",
            "Entrée d'air en façade\nBouches de Ventilation mécanique d'air dans la pièce mesurée",
            "Bouches de Ventilation mécanique d'air dans la pièce mesurée",
            "Aucune entrée d'air identifiée",
            'Autre',
          ]
        },
        { id: 'num_dosimetrie',    label: 'N° Dosimétrie',                              type: 'text',   required: true,  excelCol: 'AA', phase: 'terrain' },
        { id: 'type_dosimetre',    label: 'Type de dosimètre',                           type: 'select', required: false, excelCol: 'AB', phase: 'terrain',
          options: ['DSTN', 'Electret', 'Autre']
        },
        { id: 'marque',            label: 'Marque',                                       type: 'text',   required: false, excelCol: 'AC', phase: 'terrain' },
        { id: 'hauteur_sol',       label: 'Hauteur du dosimètre par rapport au sol (m)',   type: 'text',   required: false, excelCol: 'AD', phase: 'terrain' },
        { id: 'distance_mur',     label: 'Distance du dosimètre par rapport au mur le plus proche (m)', type: 'text', required: false, excelCol: 'AE', phase: 'terrain' },
        { id: 'date_debut',        label: 'Date de début de mesure',                       type: 'date',   required: true,  excelCol: 'AF', phase: 'terrain' },
        { id: 'date_fin',          label: 'Date de fin de mesure',                          type: 'date',   required: false, excelCol: 'AG', phase: 'terrain' },
        // durée calculée automatiquement
        { id: 'periode_inoccupation', label: "Période d'inoccupation (jours)",              type: 'number', required: false, excelCol: 'AI', phase: 'terrain' },

        // ── Résultats (labo) ──
        { id: 'dosimetre_perdu',   label: 'Dosimètre perdu ou détérioré',                  type: 'select', required: false, excelCol: 'AK', phase: 'resultats',
          options: ['NON', 'OUI']
        },
        { id: 'concentration',     label: 'Concentration mesurée (Bq/m³)',                  type: 'number', required: false, excelCol: 'AL', phase: 'resultats' },
        { id: 'incertitude',       label: 'Incertitude élargie (k=2)',                       type: 'number', required: false, excelCol: 'AM', phase: 'resultats' },
        // activité moyenne calculée par zone
      ]
    },

    // Colonnes calculées automatiquement
    computed: [
      { id: 'duree_pose',       label: 'Durée totale de pose (j)',            excelCol: 'AH', formula: '(date_fin - date_debut) en jours' },
      { id: 'taux_inoccupation',label: "Taux d'inoccupation",                excelCol: 'AJ', formula: 'periode_inoccupation / duree_pose' },
      { id: 'activite_moy',     label: 'Activité volumique moyenne (Bq/m³)', excelCol: 'AN', formula: 'moyenne des concentrations de la ZH' },
    ],
  },

  // ── SEUILS RÉGLEMENTAIRES ──────────────────────────────────
  seuils: {
    reference: 300,  // Bq/m³ — niveau de référence CSP
    couleurs: {
      vert:   { max: 300,  label: '< 300 Bq/m³',    color: '#27ae60' },
      orange: { max: 1000, label: '300–1000 Bq/m³',  color: '#f39c12' },
      rouge:  { min: 1000, label: '≥ 1000 Bq/m³',    color: '#e74c3c' },
    }
  },

  // ── ÉCARTS AUX NORMES (templates) ──────────────────────────
  ecarts_normes: [
    {
      id: 'dosimetre_perdu_sans_adjacent',
      label: 'Dosimètre perdu – pas de dosimètre adjacent',
      template: "Non-conformité à la norme NF ISO 11 665-8 : lors de la dépose des dosimètres, le détecteur n°{num} du local {local} situé au {niveau} du bâtiment (ZH n°{zh}) ne se trouve plus dans la pièce (perdu). Aucun autre dosimètre disposé dans la même zone homogène ne permet de statuer sans avoir recours à un nouveau mesurage.",
    },
    {
      id: 'dosimetre_perdu_avec_adjacent',
      label: 'Dosimètre perdu – dosimètres adjacents OK',
      template: "Non-conformité à la norme NF ISO 11 665-8 : lors de la dépose des dosimètres, le détecteur n°{num} du local {local} situé au {niveau} du bâtiment (ZH n°{zh}) ne se trouve plus dans la pièce (perdu). Cependant, les dosimètres des pièces adjacentes observent une valeur d'activité volumique faible et homogène.",
    },
    {
      id: 'duree_inoccupation',
      label: "Taux d'inoccupation > 20%",
      template: "Non-conformité à la norme NF ISO 11 665-8 : la période d'inoccupation excède 20%, correspondant à un écart à la norme.",
    },
    {
      id: 'periode_mesurage',
      label: 'Hors période de mesurage réglementaire',
      template: "Non-conformité à la décision n° 2015-DC-0506 de l'ASN : les dosimètres ont été mis en place en dehors de la période de mesurage retenue (entre le 15 septembre et le 30 avril).",
    },
    {
      id: 'strategie_incomplete',
      label: 'Stratégie de prélèvement incomplète',
      template: "Non-conformité à la norme NF ISO 11 665-8 : à la demande du client, la stratégie de prélèvement n'a pas pu être réalisée dans son entièreté.",
    },
  ],

  // ── EXPORT XLSX — mapping vers la macro ────────────────────
  export: {
    filename: 'Radon_CSP_{dossier}_{date}.xlsx',
    sheets: {
      entree: {
        name: 'Entrée',
      },
      tableau: {
        name: 'Tableau',
        startRow: 2,
      }
    }
  }
};

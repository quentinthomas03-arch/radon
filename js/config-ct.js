// ============================================================
// config-ct.js — Configuration Code du Travail (CT)
// Champs identiques à la macro HCBD CT V16.3
// ============================================================

export const CONFIG_CT = {
  type: 'CT',
  label: 'Code du Travail',
  description: 'Mesurage radon — Lieux de travail (R.4451-10 et suivants)',

  // ── ONGLET ENTRÉE ──────────────────────────────────────────
  entree: {
    sections: [
      {
        id: 'info_socotec',
        title: 'Information Organisme',
        fields: [
          { id: 'numero_dossier',    label: 'Numéro de dossier',               type: 'text',   required: true,  excelCell: 'C3'  },
          { id: 'auteur_rapport',    label: 'Auteur du rapport',                type: 'text',   required: true,  excelCell: 'C4'  },
          { id: 'tel_auteur',        label: "Tél de l'auteur",                  type: 'tel',    required: false, excelCell: 'C5'  },
          { id: 'mail_auteur',       label: "Mail de l'auteur",                 type: 'email',  required: false, excelCell: 'C6'  },
          { id: 'date_finalisation', label: 'Date de finalisation du rapport',  type: 'date',   required: false, excelCell: 'C7'  },
        ]
      },
      {
        id: 'adresse_agence',
        title: 'Adresse Agence Rédacteur',
        fields: [
          { id: 'agence_nom',     label: "Agence de l'auteur",       type: 'text', required: false, excelCell: 'F3'  },
          { id: 'agence_adr1',    label: 'Adresse (ligne 1)',        type: 'text', required: false, excelCell: 'F4'  },
          { id: 'agence_adr2',    label: 'Adresse (ligne 2)',        type: 'text', required: false, excelCell: 'F5'  },
          { id: 'agence_adr3',    label: 'Adresse (ligne 3)',        type: 'text', required: false, excelCell: 'F6'  },
          { id: 'agence_adr4',    label: 'Adresse (ligne 4)',        type: 'text', required: false, excelCell: 'F7'  },
          { id: 'agence_cp',      label: 'Code Postal',              type: 'text', required: false, excelCell: 'F8'  },
          { id: 'agence_ville',   label: 'Ville',                    type: 'text', required: false, excelCell: 'F9'  },
          { id: 'agence_tel',     label: "Tél. de l'agence",         type: 'tel',  required: false, excelCell: 'F10' },
          { id: 'agence_fax',     label: "Fax de l'agence",          type: 'text', required: false, excelCell: 'F11' },
        ]
      },
      {
        id: 'intervention',
        title: 'Intervention',
        fields: [
          { id: 'intervenant',      label: 'Intervenant sur site',     type: 'text',   required: true,  excelCell: 'C11' },
          { id: 'date_intervention', label: "Date d'intervention",     type: 'text',   required: true,  excelCell: 'C12', hint: 'Ex : 15/01/2025 ; 15/04/2025' },
          { id: 'type_depistage',   label: 'Type de dépistage',        type: 'select', required: true,  excelCell: 'C13',
            options: [
              'Dépistage initial',
              "Contrôle d'efficacité suite à la mise en place d'actions correctives simples"
            ]
          },
          { id: 'numero_chrono',    label: 'N° de Chrono',              type: 'text',   required: true,  excelCell: 'C14' },
          { id: 'version',          label: 'Version',                   type: 'number', required: false, excelCell: 'C15', default: 1 },
          { id: 'nature_revision',  label: 'Nature de révision',        type: 'text',   required: false, excelCell: 'C16', default: '/' },
        ]
      },
      {
        id: 'info_etablissement',
        title: 'Information Établissement',
        fields: [
          { id: 'etab_nom',    label: "Nom de l'établissement",  type: 'text', required: true,  excelCell: 'F15' },
          { id: 'etab_adr1',   label: 'Adresse (1)',             type: 'text', required: false, excelCell: 'F16' },
          { id: 'etab_adr2',   label: 'Adresse (2)',             type: 'text', required: false, excelCell: 'F17' },
          { id: 'etab_adr3',   label: 'Adresse (3)',             type: 'text', required: false, excelCell: 'F18' },
          { id: 'etab_cp',     label: 'Code Postal',             type: 'text', required: false, excelCell: 'F19' },
          { id: 'etab_commune',label: 'Commune',                 type: 'text', required: false, excelCell: 'F20' },
          { id: 'etab_email',  label: 'E-mail',                  type: 'email',required: false, excelCell: 'F21' },
          { id: 'etab_tel',    label: 'Tél',                     type: 'tel',  required: false, excelCell: 'F22' },
        ]
      },
      {
        id: 'nb_dosimetres',
        title: 'Stratégie',
        fields: [
          { id: 'nb_dosimetres_prevu', label: "Nombre de dosimètres prévu (d'après la stratégie)", type: 'number', required: true, excelCell: 'C23' },
          { id: 'nb_plans',            label: 'Nombre de plans de bâtiment',       type: 'number', required: false, excelCell: null, default: 1,
            hint: 'Génère les onglets Plan 1, Plan 2…' },
        ]
      },
      {
        id: 'info_proprietaire',
        title: 'Information Propriétaire / Gestionnaire',
        fields: [
          { id: 'ipg_entreprise',    label: "Nom de l'entreprise",           type: 'text',   required: false, excelCell: 'C26' },
          { id: 'ipg_civilite',      label: 'Monsieur / Madame',             type: 'select', required: false, excelCell: 'C28',
            options: ['Monsieur', 'Madame']
          },
          { id: 'ipg_nom',           label: "Nom de l'interlocuteur",        type: 'text',   required: false, excelCell: 'C29' },
          { id: 'ipg_prenom',        label: "Prénom de l'interlocuteur",     type: 'text',   required: false, excelCell: 'C30' },
          { id: 'ipg_fonction',      label: "Fonction de l'interlocuteur",   type: 'text',   required: false, excelCell: 'C31' },
          { id: 'ipg_mail',          label: "Mail de l'interlocuteur",       type: 'email',  required: false, excelCell: 'C32' },
          { id: 'ipg_tel',           label: 'Tél (standard)',                type: 'tel',    required: false, excelCell: 'C33' },
          { id: 'ipg_fax',           label: 'Fax',                           type: 'text',   required: false, excelCell: 'C34' },
          { id: 'ipg_adr1',          label: 'Adresse (1)',                   type: 'text',   required: false, excelCell: 'C35' },
          { id: 'ipg_adr2',          label: 'Adresse (2)',                   type: 'text',   required: false, excelCell: 'C36' },
          { id: 'ipg_adr3',          label: 'Adresse (3)',                   type: 'text',   required: false, excelCell: 'C37' },
          { id: 'ipg_cp',            label: 'Code Postal',                   type: 'text',   required: false, excelCell: 'C38' },
          { id: 'ipg_commune',       label: 'Commune',                       type: 'text',   required: false, excelCell: 'C39' },
        ]
      },
    ],
  },

  // ── ONGLET TABLEAU — Colonnes de mesure (CT) ──────────────
  tableau: {
    // Hiérarchie : Bâtiment > ZCS > Point de mesure (détecteur)
    niveaux: ['batiment', 'zcs', 'point'],

    // Champs du bâtiment (1 ligne par bâtiment)
    batiment: {
      label: 'Bâtiment',
      fields: [
        { id: 'nom',                  label: 'Bâtiment',                              type: 'text',   required: true,  excelCol: 'C' },
        // Champs suivants : hors grille "Tableau" de la macro (pas de colonne dédiée),
        // utilisés uniquement par la "Fiche de prélèvement par bâtiment".
        { id: 'nb_occupants',         label: "Nombre d'occupants total du bâtiment",  type: 'number', required: false, excelCol: null },
        { id: 'nb_pieces',            label: 'Nombre de pièces',                      type: 'number', required: false, excelCol: null },
        { id: 'surface_sol',          label: 'Surface au sol (m²)',                   type: 'number', required: false, excelCol: null },
        { id: 'annee_construction',   label: 'Année de construction',                 type: 'select', required: false, excelCol: 'E',
          options: [
            'Avant 1949',
            'De 1949 à 1975',
            'De 1975 à 2000',
            'Après 2000',
          ]
        },
        { id: 'materiau',             label: 'Matériau de construction principal',     type: 'select', required: false, excelCol: 'F',
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

    // Champs de la ZCS (Zone à Caractéristiques Similaires)
    zcs: {
      label: 'Zone à Caractéristiques Similaires (ZCS)',
      fields: [
        { id: 'nom',              label: 'N° ZCS',                      type: 'text',   required: true,  excelCol: 'D' },
        { id: 'niveau',           label: 'Niveau de la ZCS',            type: 'select', required: false, excelCol: 'G',
          options: [
            'Sous-sol',
            'Rez-de-chaussée',
            '1er étage',
            '2ème étage',
            '3ème étage et plus',
          ]
        },
        { id: 'activite',         label: 'Activité professionnelle',     type: 'select', required: false, excelCol: 'H',
          options: [
            'Bureau / Administration',
            'Atelier de production',
            'Entrepôt / Stockage',
            'Commerce / Vente',
            'Enseignement',
            'Santé / Soins',
            'Restauration',
            'Hébergement',
            'Activité sportive',
            'Cave / Cavité naturelle',
            'Station thermale / Spa',
            'Garage / Réparation automobile',
            'Laboratoire',
            'Autre',
          ]
        },
        { id: 'interface_sol',    label: 'Interface sol/bâtiment',       type: 'select', required: false, excelCol: 'I',
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
        { id: 'ventilation',      label: 'Ventilation',                  type: 'select', required: false, excelCol: 'J',
          options: [
            'Aucune',
            'Naturelle par ouvrants',
            'Naturelle par entrées d\'air',
            'VMC Simple flux',
            'VMC Double flux',
            'CTA',
            'Autre',
          ]
        },
        { id: 'temperature',      label: 'Température',                  type: 'select', required: false, excelCol: 'K',
          options: [
            '< Température Ambiante',
            'Température Ambiante',
            '> Température Ambiante',
          ]
        },
        { id: 'surface_sol',      label: 'Surface au sol (m²)',          type: 'number', required: false, excelCol: 'L' },
      ]
    },

    // Champs du point de mesure (1 détecteur)
    // NOTE : le champ "nb_detecteur" a été retiré de la saisie — chaque clic sur le
    // plan = 1 capteur, donc la valeur est toujours 1 ; export.js l'écrit directement
    // en colonne M (voir CONFIG_CT.tableau.computed).
    point: {
      label: 'Point de mesure',
      fields: [
        // ── Terrain (pose) ──
        { id: 'num_detecteur',    label: 'N° Détecteur',                     type: 'text',   required: true,  excelCol: 'N', phase: 'terrain', numeric: true },
        { id: 'lieu_pose',        label: 'Lieu de pose',                     type: 'text',   required: true,  excelCol: 'O', phase: 'terrain' },
        { id: 'type_fenetres',    label: 'Type de fenêtres',                 type: 'select', required: false, excelCol: 'P', phase: 'terrain',
          options: [
            'Simple vitrage',
            'Double vitrage structure bois',
            'Double vitrage structure PVC',
            'Double vitrage structure aluminium',
            'Triple vitrage',
            'Absence d\'ouvrants',
            'Autre',
          ]
        },
        { id: 'surface_piece',    label: 'Surface de la pièce instrumentée (m²)', type: 'number', required: false, excelCol: 'Q', phase: 'terrain' },
        { id: 'date_pose',        label: 'Date de pose',                     type: 'date',   required: true,  excelCol: 'R', phase: 'terrain' },
        { id: 'date_depose',      label: 'Date de dépose',                   type: 'date',   required: false, excelCol: 'S', phase: 'terrain' },
        // durée calculée automatiquement
        // ── Résultats (labo) ──
        { id: 'dosimetre_perdu',  label: 'Dosimètre perdu ou détérioré',     type: 'select', required: false, excelCol: 'V', phase: 'resultats',
          options: ['NON', 'OUI']
        },
        { id: 'activite_bqm3',   label: 'Activité volumique (Bq/m³) (k=2)', type: 'number', required: false, excelCol: 'W', phase: 'resultats' },
        { id: 'incertitude',      label: 'Incertitude',                      type: 'number', required: false, excelCol: 'X', phase: 'resultats' },
        // activité moyenne calculée par zone
      ]
    },

    // Colonnes calculées / fixes automatiquement
    computed: [
      { id: 'nb_detecteur', label: 'Nombre de détecteur',                            excelCol: 'M', fixed: 1, formula: 'toujours 1 (1 clic sur le plan = 1 capteur)' },
      { id: 'duree_pose',   label: 'Durée totale de pose (jours)',                    excelCol: 'T', formula: '(date_depose - date_pose) en jours' },
      { id: 'activite_moy', label: 'Activité volumique moyenne attribuée à la zone',  excelCol: 'Y', formula: 'moyenne des activités de la ZCS' },
    ],
  },

  // ── ÉCARTS AUX NORMES (templates) ──────────────────────────
  // Texte exact repris de l'onglet "ECARTS AUX NORMES" de la macro vierge V16.
  ecarts_normes: [
    {
      id: 'dosimetre_perdu_avec_adjacent',
      label: 'Écart 1 — Dosimètre perdu, zones adjacentes OK',
      template: "Non-conformité à la norme NF ISO 11 665-8 : lors de la dépose des dosimètres, le détecteur n°{num} du local {local} situé au {niveau} du bâtiment (ZCS n°{zone}) ne se trouve plus dans la pièce (perdu). Cependant, les dosimètres des pièces adjacentes implantés dans la même zone homogène ont été récupérés et observent une valeur d'activité volumique faible et homogène (Dosimètre n°{num2} – Local {local2} - ZCS n°{zone2} - {val2}Bq.m-3 et Dosimètre n°{num3} – Local {local3} - ZCS n°{zone3} - {val3}Bq.m-3).\nA ce titre, nous pouvons statuer sur l'absence de problématique dans la zone désignée sans avoir recours à un nouveau mesurage.",
    },
    {
      id: 'dosimetre_perdu_sans_adjacent',
      label: 'Écart 2 — Dosimètre perdu, pas de zone adjacente exploitable',
      template: "Non-conformité à la norme NF ISO 11 665-8 : lors de la dépose des dosimètres, le détecteur n°{num} du local {local} situé au {niveau} du bâtiment (ZCS n°{zone}) ne se trouve plus dans la pièce (perdu). Aucun autre dosimètre disposé dans la même zone homogène ne permet de statuer sur l'absence de problématique sans avoir recours à un nouveau mesurage au niveau de cette zone homogène.",
    },
    {
      id: 'duree_inoccupation',
      label: "Écart 3 — Taux d'inoccupation > 20%",
      template: "Non-conformité à la norme NF ISO 11 665-8 : les dispositifs de mesure doivent être laissés en place pendant au minimum deux mois. Les mesurages doivent être réalisés pendant une période où le nombre de jours consécutifs d'inoccupation du bâtiment n'excède pas 20 % de la période retenue. Dans le cas présent, la période d'inoccupation excède 20%, correspondant à un écart à la norme.",
    },
    {
      id: 'periode_mesurage',
      label: 'Écart 4 — Hors période de mesurage réglementaire',
      template: "Non-conformité à la décision n° 2015-DC-0506 de l'ASN du 9 avril 2015 : Les dosimètres ont été mis en place en dehors de la période de mesurage retenue, à savoir entre le 15 septembre d'une année et le 30 avril de l'année suivante, correspondant à un écart à la présente décision.",
    },
    {
      id: 'strategie_incomplete',
      label: 'Écart 5 — Stratégie de prélèvement incomplète',
      template: "Non-conformité à la norme NF ISO 11 665-8 : à la demande du client, la stratégie de prélèvement établie n'a pas pu être réalisée dans son entièreté. L'une des zones à caractéristiques similaires déterminée n'a pas pu être investiguée en raison de …",
    },
  ],

  // ── SEUILS RÉGLEMENTAIRES ──────────────────────────────────
  seuils: {
    reference: 300,  // Bq/m³ — niveau de référence
    couleurs: {
      vert:   { max: 300,  label: '< 300 Bq/m³',    color: '#27ae60' },
      orange: { max: 1000, label: '300–1000 Bq/m³',  color: '#f39c12' },
      rouge:  { min: 1000, label: '≥ 1000 Bq/m³',    color: '#e74c3c' },
    }
  },

  // ── EXPORT XLSX — mapping vers la macro ────────────────────
  export: {
    filename: 'Radon_CT_{dossier}_{date}.xlsx',
    sheets: {
      entree: {
        name: 'Entrée',
        // mapping field_id → cell excel (déjà dans chaque field.excelCell)
      },
      tableau: {
        name: 'Tableau',
        startRow: 2,
        // mapping field_id → col excel (déjà dans chaque field.excelCol)
      }
    }
  }
};

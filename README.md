# MaintiMatch V1 réellement connecté

V1 opérationnelle avec :
- PostgreSQL persistant via Docker
- API backend Express
- connecteur OAuth2 France Travail (offres)
- filtrage Île-de-France 75/77/78/91/92/93/94/95
- mots-clés maintenance industrielle / électrotechnique / électromécanique / SAV
- enrichissement entreprise via API Recherche Entreprises (SIRENE) quand possible
- filtre PME ≤40 salariés quand l'effectif est vérifiable
- scoring commercial PME
- candidats manuels + matching bidirectionnel
- alertes à partir de 85 %
- synchronisation automatique à 10:00 Europe/Paris
- export Excel des offres

## Démarrage
1. Installer Node.js 20+ et Docker.
2. `cp .env.example .env`
3. Créer une application API France Travail sur https://francetravail.io/ et renseigner `FT_CLIENT_ID` et `FT_CLIENT_SECRET`.
4. `docker compose up -d`
5. `npm install`
6. `npm start`
7. Ouvrir http://localhost:3000

## Important
La V1 utilise uniquement des accès autorisés. Elle ne contourne ni CAPTCHA, ni authentification, ni protections anti-bot. Les sources comme LinkedIn, Indeed, HelloWork, etc. doivent être ajoutées séparément avec leurs API/flux/partenariats autorisés. Les données candidat ne sont pas aspirées depuis des zones privées.

## Limite actuelle
Le connecteur France Travail est réel, mais nécessite les identifiants API du propriétaire de l'application. Tant que ces variables ne sont pas renseignées, aucune synchronisation France Travail n'est lancée.


## Actualisation automatique
La fréquence est configurable dans l'onglet Paramètres : 15 min, 30 min, 1 h, 2 h, 6 h, 12 h ou 24 h. La valeur par défaut est 60 minutes.

# Plan d'intégration — Mobile ↔ BFF ↔ Doppa

> Généré le 17/06/2026 — À appliquer avant tout commit.

---

## Vue d'ensemble des incompatibilités détectées

| # | Composant | Problème | Gravité |
|---|-----------|----------|---------|
| 1 | Mobile `client.ts` | URL BFF codée en dur (`localhost:3000`) | 🔴 Critique |
| 2 | Mobile `auth.api.ts` | Login appelle `/auth/users/login` — endpoint inexistant sur le BFF | 🔴 Critique |
| 3 | BFF `tenant.controller.ts` | `GET /tenant` protégé ADMIN, mais `TenantSelectionScreen` en a besoin **sans auth** | 🔴 Critique |
| 4 | Mobile `auth.api.ts` | `forgotPassword` / `resetPassword` appellent des endpoints inexistants sur le BFF | 🟠 Majeur |
| 5 | Mobile `client.ts` | Intercepteur 401 : efface le token mais n'appelle pas `logout()` → écran bloqué | 🟠 Majeur |
| 6 | Mobile `types/index.ts` | `DashboardData.recentOrders: Payment[]` mais BFF renvoie maintenant `subscription` | 🟠 Majeur |
| 7 | Mobile `payment.api.ts` | Appelle `GET /payments` — endpoint absent du BFF | 🟠 Majeur |
| 8 | Mobile `checkin.api.ts` | Appelle `GET /checkins` — endpoint absent du BFF | 🟡 Moyen |
| 9 | Mobile `classSchedule.api.ts` | Appelle `/class-schedules`, `/bookings` — absents du BFF | 🟡 Moyen |
| 10 | Mobile `store/auth.store.ts` | `loadFromStorage` restaure `isAuthenticated` mais pas `user` → profil vide au relancement | 🟡 Moyen |
| 11 | Mobile `DashboardScreen.tsx` | Affiche `recentOrders` — section à remplacer par `subscription` | 🟡 Moyen |
| 12 | BFF `payment.controller.ts` | Fichier vide — `GET /payments` non implémenté | 🟡 Moyen |
| 13 | Mobile `.env` | Aucun fichier `.env` — configuration non séparable par environnement | 🔵 Mineur |
| 14 | Mobile `auth.store.ts` | Helpers `storage` dupliqués dans `auth.store.ts` et `client.ts` | 🔵 Mineur |

---

## Partie 1 — Corrections côté BFF (`gympify-mobile-bff`)

### BFF-1 · `tenant.controller.ts` — Rendre `GET /tenant` public

**Problème** : `TenantSelectionScreen` appelle `GET /tenant` avant toute authentification (l'utilisateur doit d'abord choisir son gym). Avec notre correction précédente (ADMIN only), cet écran ne peut plus charger la liste des salles.

**Solution** : retirer `@UseGuards` et `@Roles('ADMIN')` du `GET /tenant`. La donnée retournée (`id`, `name`, `category`) est délibérément minimale — pas de fuite sensible.

```diff
- @Get()
- @UseGuards(JwtAuthGuard, RolesGuard)
- @Roles('ADMIN')
- async list() {
+ @Get()
+ async list() {
```

---

### BFF-2 · `auth.controller.ts` — Ajouter les alias `/auth/users/login` et `/auth/admins/login`

**Problème** : le mobile appelle `/auth/users/login` (membres) et `/auth/admins/login` (admins). Le BFF n'expose que `/auth/login`.

**Solution** : ajouter deux routes alias qui redirigent vers le même `AuthService.login()`.

```typescript
// Alias membre → même logique que POST /auth/login
@Post('users/login')
@HttpCode(HttpStatus.OK)
async loginUser(@Body() dto: LoginDto) {
  return this.authService.login(dto.email, dto.pass);
}

// Alias admin → même logique (table admins non encore implémentée, répond avec MEMBER)
@Post('admins/login')
@HttpCode(HttpStatus.OK)
async loginAdmin(@Body() dto: LoginDto) {
  return this.authService.login(dto.email, dto.pass);
}
```

> **Note** : l'authentification admin via la table `admins` sera une évolution ultérieure (la table existe en base mais est vide). Pour l'instant les deux alias pointent vers `users`.

---

### BFF-3 · `payment.controller.ts` — Implémenter `GET /payments`

**Problème** : le fichier est vide. `PaymentsScreen` appelle `GET /payments`.

**Solution** : implémenter l'endpoint en injectant `PaymentService` et l'utilisateur actif via `@ActiveUser`.

```typescript
@Controller({ path: 'payments', version: '1' })
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  async getMyPayments(@ActiveUser() user: ActiveUserData) {
    return this.paymentService.getHistory(user.sub);
  }
}
```

> **Note** : `PaymentService.getHistory()` retourne les `orders` dont `customer_id = user.globalId`. Dans la base Doppa actuelle, ces commandes sont liées aux tenants (pas aux users), donc la liste sera vide. Le endpoint est fonctionnel et retourne `[]` sans erreur — les données apparaîtront dès que des commandes membres existent.

---

### BFF-4 · Nouveaux stubs — `/checkins`, `/class-schedules`, `/bookings`

**Problème** : ces tables n'existent pas dans la base centrale Doppa (elles sont dans les bases per-tenant de la future architecture). Le mobile les appelle et reçoit une 404.

**Solution** : créer un `TenantFeaturesController` protégé par JWT qui retourne des tableaux vides avec le bon format, garantissant que les écrans du mobile s'affichent sans erreur.

```
GET /api/v1/checkins          → [] (JWT requis)
GET /api/v1/class-schedules   → [] (JWT requis)
POST /api/v1/class-schedules/:id → 501 Not Implemented
GET /api/v1/bookings          → [] (JWT requis)
POST /api/v1/bookings/:id/cancel → 501 Not Implemented
```

Fichier : `src/modules/tenant-features/tenant-features.controller.ts`

---

## Partie 2 — Corrections côté Mobile (`gympify-mobile`)

### MOB-1 · Créer `.env` — URL BFF configurable

**Problème** : `BFF_BASE_URL = 'http://localhost:3000/api/v1'` est codé en dur dans `client.ts`.

**Solution** : créer `.env` avec `EXPO_PUBLIC_BFF_URL` (Expo expose automatiquement les variables `EXPO_PUBLIC_*` à l'application).

```env
# .env (développement local)
EXPO_PUBLIC_BFF_URL=http://localhost:3000/api/v1

# .env.production (VPS)
EXPO_PUBLIC_BFF_URL=http://vps-cf0e7d7b.vps.ovh.net:3000/api/v1
```

---

### MOB-2 · `src/api/client.ts` — URL dynamique + intercepteur 401 complet

**Deux corrections** :

1. Utiliser `process.env.EXPO_PUBLIC_BFF_URL` au lieu de la constante.
2. L'intercepteur 401 efface le token mais n'appelle pas `logout()` du store Zustand → `isAuthenticated` reste `true` → l'utilisateur voit les écrans membres alors que son token est invalide.

```diff
- const BFF_BASE_URL = 'http://localhost:3000/api/v1';
+ const BFF_BASE_URL = process.env.EXPO_PUBLIC_BFF_URL ?? 'http://localhost:3000/api/v1';
```

```diff
  if (error.response?.status === 401) {
    await storage.deleteItemAsync('access_token');
+   // Sync the Zustand store so navigation redirects to Login
+   const { logout } = useAuthStore.getState();
+   await logout();
  }
```

---

### MOB-3 · `src/api/auth.api.ts` — Corriger les chemins login

**Problème** : les endpoints `forgotPassword` et `resetPassword` appellent des routes inexistantes (`/auth/users/request-password`, etc.). Ces fonctionnalités ne sont pas implémentées dans le BFF.

**Solution** : 
- `login` : inchangé — les aliases BFF-2 couvrent `/auth/users/login` et `/auth/admins/login`.
- `forgotPassword` / `resetPassword` : wrapper dans un try/catch avec message d'erreur informatif, ou retirer du scope tant que le BFF ne les expose pas.

```diff
  forgotPassword: async (email: string, guard: 'admins' | 'users' = 'users'): Promise<void> => {
-   await apiClient.post(`/auth/${guard}/request-password`, { email: email.trim() });
+   // Not yet implemented on BFF — throws a user-friendly error
+   throw new Error('La réinitialisation du mot de passe n\'est pas encore disponible dans cette version.');
  },
```

---

### MOB-4 · `src/types/index.ts` — Mettre à jour `DashboardData`

**Problème** : le BFF renvoie `{ user, subscription }` mais le type attend `{ user, recentOrders }`.

**Solution** : ajouter `subscription` et rendre `recentOrders` optionnel (rétro-compatibilité).

```diff
+ export interface TenantSubscription {
+   plan: string | null;
+   status: string;
+   startsAt: string | null;
+   endsAt: string | null;
+ }

  export interface DashboardData {
    user: User;
-   recentOrders: Payment[];
+   recentOrders?: Payment[];
+   subscription: TenantSubscription | null;
  }
```

---

### MOB-5 · `src/screens/DashboardScreen.tsx` — Afficher l'abonnement du tenant

**Problème** : la section "Dernières commandes" affiche `recentOrders` qui est maintenant absent du payload BFF.

**Solution** : remplacer la section commandes par une **carte d'abonnement** montrant le plan actif du gym et sa date d'expiration. Conserver le QR code et le profil utilisateur inchangés.

```
Avant : Section "Dernières commandes" → [] toujours vide
Après : Section "Abonnement du gym"   → plan, statut, expiration
```

---

### MOB-6 · `src/store/auth.store.ts` — Persister `user` au rechargement

**Problème** : `loadFromStorage()` restaure `token` et `isAuthenticated: true` mais `user` reste `null`. Au redémarrage de l'app, `user?.firstName` est `undefined` → les écrans affichent "Bonjour, " sans nom.

**Solution** : persister l'objet `user` (sans données sensibles) dans le secure store au `login()`, et le restaurer dans `loadFromStorage()`.

```diff
  login: async (token, user) => {
    await storage.setItemAsync('access_token', token);
+   await storage.setItemAsync('current_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: async () => {
    await storage.deleteItemAsync('access_token');
+   await storage.deleteItemAsync('current_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  loadFromStorage: async () => {
    const token = await storage.getItemAsync('access_token');
+   const userJson = await storage.getItemAsync('current_user');
    if (token) {
+     const user = userJson ? JSON.parse(userJson) : null;
-     set({ token, isAuthenticated: true });
+     set({ token, user, isAuthenticated: true });
    }
  },
```

---

## Récapitulatif des fichiers à modifier

### BFF — `gympify-mobile-bff/src/`

| Fichier | Action |
|---------|--------|
| `modules/tenant/tenant.controller.ts` | Retirer guards ADMIN sur `GET /` |
| `modules/auth/auth.controller.ts` | Ajouter `POST users/login` et `POST admins/login` |
| `modules/payment/payment.controller.ts` | Implémenter `GET /payments` |
| `modules/tenant-features/tenant-features.controller.ts` | **Nouveau** — stubs checkins, class-schedules, bookings |
| `modules/tenant-features/tenant-features.module.ts` | **Nouveau** — déclaration du module |
| `app.module.ts` | Importer `TenantFeaturesModule` |

### Mobile — `gympify-mobile/`

| Fichier | Action |
|---------|--------|
| `.env` | **Nouveau** — `EXPO_PUBLIC_BFF_URL` dev |
| `.env.production` | **Nouveau** — `EXPO_PUBLIC_BFF_URL` VPS |
| `src/api/client.ts` | URL dynamique + intercepteur 401 complet |
| `src/api/auth.api.ts` | Stub forgotPassword/resetPassword |
| `src/types/index.ts` | Ajouter `TenantSubscription`, mettre à jour `DashboardData` |
| `src/screens/DashboardScreen.tsx` | Remplacer section commandes par abonnement |
| `src/store/auth.store.ts` | Persister et restaurer `user` |

---

## Ordre d'application recommandé

```
1. BFF-1  → GET /tenant public           (débloquer TenantSelection)
2. BFF-2  → Alias login                  (débloquer auth mobile)
3. BFF-3  → GET /payments                (éviter 404 PaymentsScreen)
4. BFF-4  → Stubs checkins/schedules     (éviter 404 autres écrans)
5. MOB-1  → .env                         (configurer URL)
6. MOB-2  → client.ts                    (URL + intercepteur 401)
7. MOB-3  → auth.api.ts                  (sécuriser forgotPassword)
8. MOB-4  → types/index.ts               (aligner types BFF)
9. MOB-5  → DashboardScreen.tsx          (afficher subscription)
10. MOB-6 → auth.store.ts                (persister user)
```

> Après chaque groupe BFF (1-4) : rebuild + redéploiement sur le VPS.  
> Après les corrections Mobile (5-10) : `npm start` et test Expo Go.

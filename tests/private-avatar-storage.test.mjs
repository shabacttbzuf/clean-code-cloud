import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000009_private_avatar_and_company_asset_scope.sql", import.meta.url),
  "utf8",
);
const profilePage = readFileSync(
  new URL("../src/routes/_authenticated/profile.tsx", import.meta.url),
  "utf8",
);
const usersPage = readFileSync(
  new URL("../src/routes/_authenticated/users.tsx", import.meta.url),
  "utf8",
);
const usersFunctions = readFileSync(
  new URL("../src/lib/users.functions.ts", import.meta.url),
  "utf8",
);
const storageHelper = readFileSync(
  new URL("../src/lib/storage.ts", import.meta.url),
  "utf8",
);
const settingsPage = readFileSync(
  new URL("../src/routes/_authenticated/settings.tsx", import.meta.url),
  "utf8",
);
const adsPage = readFileSync(
  new URL("../src/routes/_authenticated/ads.tsx", import.meta.url),
  "utf8",
);
const hrEmployeesPage = readFileSync(
  new URL("../src/routes/_authenticated/hr.employees.tsx", import.meta.url),
  "utf8",
);

test("profile avatars are stored in a private bucket and served with signed URLs", () => {
  assert.match(migration, /'restaurant-private-assets',[\s\S]*false/i);
  assert.match(migration, /private_profile_avatar_select[\s\S]*private\.can_access_creator_company/i);
  assert.match(migration, /private_profile_avatar_insert[\s\S]*split_part\(name,'\/',3\)=\(select auth\.uid\(\)\)::text/i);
  assert.match(profilePage, /from\("restaurant-private-assets"\)\.upload/);
  assert.match(profilePage, /createSignedUrl\(path, 60 \* 60 \* 24\)/);
  assert.match(profilePage, /private:\/\/\$\{path\}/);
  assert.match(storageHelper, /createSignedUrl\(path, 60 \* 60 \* 24\)/);
  assert.match(usersPage, /resolveAvatarUrl\(p\?\.avatar_url \?\? null\)/);
});

test("profile updates cannot point to another user's private avatar path", () => {
  assert.match(usersFunctions, /avatar_url: z\.string\(\)\.max\(2048\)\.refine/);
  assert.match(usersFunctions, /updateMyProfile[\s\S]*avatar_url: z\.string\(\)\.max\(2048\)\.refine/);
  assert.match(usersFunctions, /parts\[2\] !== context\.userId/);
});

test("public asset writes are restricted to tenant owner or the matching company", () => {
  assert.match(migration, /private\.can_manage_company_assets[\s\S]*_actor_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /restaurant_assets_company_scope_insert[\s\S]*private\.can_manage_company_assets/i);
  assert.match(migration, /restaurant_assets_company_scope_update[\s\S]*private\.can_manage_company_assets/i);
  assert.match(migration, /restaurant_assets_company_scope_delete[\s\S]*private\.can_manage_company_assets/i);
  assert.match(migration, /split_part\(name,'\/',2\)='companies'/i);
});

test("public category images are included in the scoped asset folders", () => {
  assert.match(migration, /'branches','categories'/);
});

test("company asset writes require the matching feature permission and include employee avatars", () => {
  assert.match(migration, /when 'products' then public\.has_permission\(_actor_id,_tenant_id,'products\.manage'\)/i);
  assert.match(migration, /when 'branches' then public\.has_permission\(_actor_id,_tenant_id,'branches\.manage'\)/i);
  assert.match(migration, /when 'categories' then public\.has_permission\(_actor_id,_tenant_id,'categories\.manage'\)/i);
  assert.match(migration, /when 'avatars' then public\.has_permission\(_actor_id,_tenant_id,'hr\.employees\.manage'\)/i);
  assert.match(migration, /'branches','categories','avatars'/i);
  assert.match(hrEmployeesPage, /companyId=\{companyId\} folder="avatars"/);
});

test("company campaign images use the company asset namespace", () => {
  assert.match(adsPage, /companies\/\$\{membership\.company_id\}\/marketing/);
  assert.match(adsPage, /permissions\.data\?\.includes\("ads\.manage"\) === true/);
  assert.match(adsPage, /const isTenantOwner = role === "owner" && !membership\?\.company_id/);
});

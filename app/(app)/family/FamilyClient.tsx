// app/(app)/family/FamilyClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type FamilyMember = {
  id: string;
  user_id: string;
  name: string;
  birth_year: number | null;
  relationship: string | null;
  about: string | null;
  created_at: string;
  updated_at: string;
};

type Pet = {
  id: string;
  user_id: string;
  name: string;
  type: string | null;
  notes: string | null; // shown as "About"
  created_at: string;
  updated_at: string;
};

function clampYear(y: string) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 1900) return 1900;
  const max = new Date().getFullYear();
  if (n > max) return max;
  return Math.floor(n);
}

export default function FamilyClient() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);

  const [addOpen, setAddOpen] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null); // "me" | "fm:<id>" | "pet:<id>"
  const [drafts, setDrafts] = useState<Record<string, any>>({});

  const me = useMemo(() => {
    const found = family.find((m) => (m.relationship ?? "").toLowerCase().trim() === "me");
    return found ?? null;
  }, [family]);

  const others = useMemo(() => {
    return family
      .filter((m) => (m.relationship ?? "").toLowerCase().trim() !== "me")
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [family]);

  const sortedPets = useMemo(() => {
    return [...pets].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [pets]);

  const ensureMeRow = async (uid: string) => {
    const { data, error } = await supabase
      .from("family_members")
      .select("id")
      .eq("user_id", uid)
      .ilike("relationship", "me")
      .limit(1);

    if (error) return;
    if ((data ?? []).length > 0) return;

    await supabase.from("family_members").insert({
      user_id: uid,
      name: "Me",
      birth_year: null,
      relationship: "Me",
      about: null,
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setUserId(null);
        setFamily([]);
        setPets([]);
        return;
      }

      setUserId(user.id);

      await ensureMeRow(user.id);

      const [fRes, pRes] = await Promise.all([
        supabase
          .from("family_members")
          .select("id,user_id,name,birth_year,relationship,about,created_at,updated_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase.from("pets").select("id,user_id,name,type,notes,created_at,updated_at").eq("user_id", user.id).order("created_at", { ascending: true }),
      ]);

      if (fRes.error) throw fRes.error;
      if (pRes.error) throw pRes.error;

      setFamily((fRes.data as FamilyMember[]) ?? []);
      setPets((pRes.data as Pet[]) ?? []);
    } catch (e: any) {
      toast({ title: "Couldn’t load Family", description: e?.message ?? "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelEdit = () => setEditingKey(null);

  const startEditMe = () => {
    if (!me) return;
    const key = "me";
    setEditingKey(key);
    setDrafts((prev) => ({
      ...prev,
      [key]: { name: me.name ?? "", birth_year: me.birth_year ?? null, about: me.about ?? "" },
    }));
  };

  const startEditFamily = (m: FamilyMember) => {
    const key = `fm:${m.id}`;
    setEditingKey(key);
    setDrafts((prev) => ({
      ...prev,
      [key]: { name: m.name ?? "", relationship: m.relationship ?? "", birth_year: m.birth_year ?? null, about: m.about ?? "" },
    }));
  };

  const startEditPet = (p: Pet) => {
    const key = `pet:${p.id}`;
    setEditingKey(key);
    setDrafts((prev) => ({
      ...prev,
      [key]: { name: p.name ?? "", type: p.type ?? "", notes: p.notes ?? "" },
    }));
  };

  const saveMe = async () => {
    if (!userId || !me) return;

    const key = "me";
    const d = drafts[key] ?? {};
    const name = String(d.name ?? "").trim();
    if (!name) {
      toast({ title: "Name is required", description: "Just a simple name is enough." });
      return;
    }

    const birth = d.birth_year === "" || d.birth_year === undefined ? null : Number(d.birth_year);
    const about = String(d.about ?? "").trim();

    const patch = {
      name,
      birth_year: Number.isFinite(birth) ? birth : null,
      about: about.length ? about : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("family_members").update(patch).eq("id", me.id).eq("user_id", userId);
    if (error) {
      toast({ title: "Couldn’t save", description: error.message });
      return;
    }

    setFamily((prev) => prev.map((x) => (x.id === me.id ? { ...x, ...patch } : x)));
    setEditingKey(null);
    toast({ title: "Saved", description: "Updated." });
  };

  const saveFamily = async (m: FamilyMember) => {
    if (!userId) return;

    const key = `fm:${m.id}`;
    const d = drafts[key] ?? {};
    const name = String(d.name ?? "").trim();
    if (!name) {
      toast({ title: "Name is required", description: "Just a simple name is enough." });
      return;
    }

    const relationship = String(d.relationship ?? "").trim();
    const birth = d.birth_year === "" || d.birth_year === undefined ? null : Number(d.birth_year);
    const about = String(d.about ?? "").trim();

    const patch = {
      name,
      relationship: relationship.length ? relationship : null,
      birth_year: Number.isFinite(birth) ? birth : null,
      about: about.length ? about : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("family_members").update(patch).eq("id", m.id).eq("user_id", userId);
    if (error) {
      toast({ title: "Couldn’t save", description: error.message });
      return;
    }

    setFamily((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
    setEditingKey(null);
    toast({ title: "Saved", description: "Updated." });
  };

  const removeFamily = async (m: FamilyMember) => {
    if (!userId) return;
    if ((m.relationship ?? "").toLowerCase().trim() === "me") return;

    const { error } = await supabase.from("family_members").delete().eq("id", m.id).eq("user_id", userId);
    if (error) {
      toast({ title: "Couldn’t remove", description: error.message });
      return;
    }

    setFamily((prev) => prev.filter((x) => x.id !== m.id));
    toast({ title: "Removed", description: "You can add them again any time." });
  };

  const savePet = async (p: Pet) => {
    if (!userId) return;

    const key = `pet:${p.id}`;
    const d = drafts[key] ?? {};
    const name = String(d.name ?? "").trim();
    if (!name) {
      toast({ title: "Name is required", description: "Just a simple name is enough." });
      return;
    }

    const type = String(d.type ?? "").trim();
    const notes = String(d.notes ?? "").trim();

    const patch = {
      name,
      type: type.length ? type : null,
      notes: notes.length ? notes : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("pets").update(patch).eq("id", p.id).eq("user_id", userId);
    if (error) {
      toast({ title: "Couldn’t save", description: error.message });
      return;
    }

    setPets((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    setEditingKey(null);
    toast({ title: "Saved", description: "Updated." });
  };

  const removePet = async (p: Pet) => {
    if (!userId) return;

    const { error } = await supabase.from("pets").delete().eq("id", p.id).eq("user_id", userId);
    if (error) {
      toast({ title: "Couldn’t remove", description: error.message });
      return;
    }

    setPets((prev) => prev.filter((x) => x.id !== p.id));
    toast({ title: "Removed", description: "You can add them again any time." });
  };

  const addFamilyMember = async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("family_members")
      .insert({ user_id: userId, name: "New person", birth_year: null, relationship: null, about: null })
      .select("id,user_id,name,birth_year,relationship,about,created_at,updated_at")
      .single();

    if (error) {
      toast({ title: "Couldn’t add", description: error.message });
      return;
    }

    const row = data as FamilyMember;
    setFamily((prev) => [...prev, row]);
    setAddOpen(false);
    startEditFamily(row);
  };

  const addPet = async () => {
    if (!userId) return;

    const { data, error } = await supabase.from("pets").insert({ user_id: userId, name: "New pet", type: null, notes: null }).select("id,user_id,name,type,notes,created_at,updated_at").single();

    if (error) {
      toast({ title: "Couldn’t add", description: error.message });
      return;
    }

    const row = data as Pet;
    setPets((prev) => [...prev, row]);
    setAddOpen(false);
    startEditPet(row);
  };

  return (
    <Page title="Family" subtitle="People (and pets) Keystone can keep in mind when helping with decisions.">
      <div className="space-y-4">
        {loading ? <div className="text-sm text-zinc-500">Loading…</div> : null}

        {/* Me */}
        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Me</div>
                <div className="text-xs text-zinc-500">Optional context Keystone can keep in mind.</div>
              </div>

              {editingKey === "me" ? (
                <div className="flex items-center gap-2">
                  <Chip onClick={() => void saveMe()}>Save</Chip>
                  <Chip onClick={cancelEdit}>Cancel</Chip>
                </div>
              ) : (
                <Chip onClick={startEditMe}>Edit</Chip>
              )}
            </div>

            {me ? (
              editingKey === "me" ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Name</div>
                    <input
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={String((drafts["me"]?.name ?? "") as string)}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, me: { ...prev.me, name: e.target.value } }))}
                      placeholder="e.g. Em"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">Year of birth (optional)</div>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={drafts["me"]?.birth_year == null ? "" : String(drafts["me"]?.birth_year)}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, me: { ...prev.me, birth_year: e.target.value ? clampYear(e.target.value) : null } }))}
                      placeholder="e.g. 1992"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-zinc-500">About (optional)</div>
                    <textarea
                      className="min-h-[96px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                      value={String((drafts["me"]?.about ?? "") as string)}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, me: { ...prev.me, about: e.target.value } }))}
                      placeholder="Values, goals, preferences, constraints… (only what you want Keystone to consider)"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-zinc-800">{me.name}</div>
                  {me.birth_year ? <div className="text-sm text-zinc-700">Born {me.birth_year}</div> : null}
                  {me.about ? <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{me.about}</div> : <div className="text-sm text-zinc-500">No notes yet.</div>}
                </div>
              )
            ) : (
              <div className="text-sm text-zinc-600">Setting up…</div>
            )}
          </CardContent>
        </Card>

        {/* Add */}
        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">Add someone</div>
            <div className="text-sm text-zinc-700">Add people you do life with — or anyone whose needs should be considered in decisions.</div>

            {!addOpen ? (
              <div className="pt-1">
                <Chip onClick={() => setAddOpen(true)}>Add…</Chip>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="text-sm text-zinc-700">What are you adding?</div>
                <div className="flex flex-wrap gap-2">
                  <Chip onClick={() => void addFamilyMember()}>A family member</Chip>
                  <Chip onClick={() => void addPet()}>A pet</Chip>
                  <Chip onClick={() => setAddOpen(false)}>Cancel</Chip>
                </div>
                <div className="text-xs text-zinc-500">Names only is fine.</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Family members */}
        {others.length > 0 ? (
          <div className="grid gap-3">
            {others.map((m) => {
              const key = `fm:${m.id}`;
              const isEditing = editingKey === key;
              const d = drafts[key] ?? {};

              return (
                <Card key={m.id} className="border-zinc-200 bg-white">
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900">{m.name}</div>
                        <div className="text-xs text-zinc-500">{m.relationship ? m.relationship : "Family member"}</div>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Chip onClick={() => void saveFamily(m)}>Save</Chip>
                          <Chip onClick={cancelEdit}>Cancel</Chip>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Chip onClick={() => startEditFamily(m)}>Edit</Chip>
                          <Chip onClick={() => void removeFamily(m)}>Remove</Chip>
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="text-xs text-zinc-500">Name</div>
                          <input
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                            value={String(d.name ?? "")}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], name: e.target.value } }))}
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs text-zinc-500">Relationship (optional)</div>
                          <input
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                            value={String(d.relationship ?? "")}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], relationship: e.target.value } }))}
                            placeholder="e.g. Partner, Child, Mum"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs text-zinc-500">Year of birth (optional)</div>
                          <input
                            type="number"
                            inputMode="numeric"
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                            value={d.birth_year == null ? "" : String(d.birth_year)}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], birth_year: e.target.value ? clampYear(e.target.value) : null },
                              }))
                            }
                            placeholder="e.g. 2019"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs text-zinc-500">About (optional)</div>
                          <textarea
                            className="min-h-[96px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                            value={String(d.about ?? "")}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], about: e.target.value } }))}
                            placeholder="Anything helpful for Keystone to keep in mind…"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {m.birth_year ? <div className="text-sm text-zinc-700">Born {m.birth_year}</div> : null}
                        {m.about ? <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{m.about}</div> : <div className="text-sm text-zinc-500">No notes yet.</div>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="text-sm text-zinc-600">No other family members added yet.</div>
            </CardContent>
          </Card>
        )}

        {/* Pets */}
        {sortedPets.length > 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">Pets</div>
            <div className="grid gap-3">
              {sortedPets.map((p) => {
                const key = `pet:${p.id}`;
                const isEditing = editingKey === key;
                const d = drafts[key] ?? {};

                return (
                  <Card key={p.id} className="border-zinc-200 bg-white">
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900">{p.name}</div>
                          <div className="text-xs text-zinc-500">{p.type ? p.type : "Pet"}</div>
                        </div>

                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Chip onClick={() => void savePet(p)}>Save</Chip>
                            <Chip onClick={cancelEdit}>Cancel</Chip>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Chip onClick={() => startEditPet(p)}>Edit</Chip>
                            <Chip onClick={() => void removePet(p)}>Remove</Chip>
                          </div>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="text-xs text-zinc-500">Name</div>
                            <input
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                              value={String(d.name ?? "")}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], name: e.target.value } }))}
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs text-zinc-500">Type (optional)</div>
                            <input
                              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                              value={String(d.type ?? "")}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], type: e.target.value } }))}
                              placeholder="e.g. Dog, Cat"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="text-xs text-zinc-500">About (optional)</div>
                            <textarea
                              className="min-h-[96px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                              value={String(d.notes ?? "")}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], notes: e.target.value } }))}
                              placeholder="Health needs, meds, routines, costs…"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {p.notes ? <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{p.notes}</div> : <div className="text-sm text-zinc-500">No notes yet.</div>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="text-sm text-zinc-600">No pets added yet.</div>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}

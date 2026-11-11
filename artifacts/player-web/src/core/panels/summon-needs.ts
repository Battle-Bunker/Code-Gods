/** Why Summon is still off, for a player with code in the editor: validate first, name the agent, then afford it. */
export function summonNeeds(validated: boolean, named: boolean, affordable: boolean): string | null {
  if (!validated) return named ? "To summon: validate this code first." : "To summon: validate this code and give the agent a name.";
  if (!named) return "To summon: give the agent a name.";
  return affordable ? null : "Not enough energy to summon this agent yet.";
}

import { Router } from "express";
import { requireAdmin, requireIdentity } from "../lib/identity";
import {
  agentInputSchema, agentUpdateSchema, agentRevisionSchema,
  createAgent, updateAgent, deleteAgent, listAgentDefinitions, listAgentModels, listPublicAgents,
} from "../game/agent-library";

const router = Router();
router.get("/ai-agents", async (req, res) => {
  requireIdentity(req);
  res.json({ agents: await listPublicAgents() });
});
router.use("/admin/ai-agents", (req, _res, next) => {
  try { requireAdmin(req); next(); } catch (error) { next(error); }
});
router.get("/admin/ai-agents", async (_req, res) => {
  res.json({ agents: await listAgentDefinitions(), models: listAgentModels() });
});
router.post("/admin/ai-agents", async (req, res) => {
  res.status(201).json(await createAgent(agentInputSchema.parse(req.body)));
});
router.patch("/admin/ai-agents/:id", async (req, res) => {
  res.json(await updateAgent(req.params.id, agentUpdateSchema.parse(req.body)));
});
router.delete("/admin/ai-agents/:id", async (req, res) => {
  await deleteAgent(req.params.id, agentRevisionSchema.parse(req.query.revision));
  res.status(204).end();
});
export default router;

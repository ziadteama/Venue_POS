/** Basic IPv4 validation for hub-assigned terminal addresses. */
export function isValidLanHost(value) {
  if (value == null || value === '') return true;
  const text = String(value).trim();
  if (!text) return true;
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(text);
}

export function resolveTerminalLanHost(terminal) {
  return terminal?.assignedLanHost?.trim() || terminal?.lastLanHost?.trim() || null;
}

/** LAN peer list + coordinator hints pushed to agents via roster sync. */
export async function buildVenueLanConfig(prisma, venueId, selfTerminalId = null) {
  const terminals = await prisma.terminal.findMany({
    where: { venueId, isActive: true },
    select: {
      id: true,
      name: true,
      assignedLanHost: true,
      lastLanHost: true,
      lastLanPort: true,
      isCoordinator: true,
      coordinatorLanHost: true,
    },
    orderBy: { name: 'asc' },
  });

  const coordinator = terminals.find((t) => t.isCoordinator) ?? null;
  const coordinatorLanHost =
    coordinator?.coordinatorLanHost?.trim() ||
    coordinator?.assignedLanHost?.trim() ||
    null;

  const peers = terminals
    .filter((t) => t.id !== selfTerminalId)
    .map((t) => ({
      terminalId: t.id,
      name: t.name,
      assignedLanHost: t.assignedLanHost?.trim() || null,
      lastLanHost: t.lastLanHost?.trim() || null,
      lanHost: resolveTerminalLanHost(t),
      lanPort: t.lastLanPort ?? null,
    }))
    .filter((p) => p.lanHost);

  return {
    coordinatorTerminalId: coordinator?.id ?? null,
    coordinatorLanHost,
    peers,
  };
}

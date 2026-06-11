/** Full tab/settlement total: this cheque plus split children or cross-venue members. */
export function combinedChequeTotal(cheque) {
  if (!cheque) return 0;

  const groupMembers = cheque.crossVenueGroup?.cheques ?? cheque.crossVenueGroup?.members;
  if (groupMembers?.length) {
    return Number(
      groupMembers.reduce((sum, member) => sum + Number(member.total ?? 0), 0).toFixed(2),
    );
  }

  const children = cheque.childCheques ?? [];
  if (children.length) {
    return Number(
      (Number(cheque.total ?? 0) + children.reduce((sum, child) => sum + Number(child.total ?? 0), 0)).toFixed(
        2,
      ),
    );
  }

  return Number(cheque.total ?? 0);
}

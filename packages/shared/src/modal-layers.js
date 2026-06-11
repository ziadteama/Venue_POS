/** Stacking order: each nested overlay should use a higher layer than its parent. */
export const MODAL_Z = {
  base: 50,
  drawer: 55,
  stacked: 60,
  nested: 70,
  critical: 80,
  toast: 100,
};

/**
 * Phase 1 integration suite.
 * Tests live in ./phase1/*.js and share one DB fixture via ./phase1/fixture.js.
 * This file is the single entry point so the suite runs sequentially with shared state.
 */
import './phase1/fixture.js';
import './phase1/auth-menu.js';
import './phase1/cheques.js';
import './phase1/shifts.js';
import './phase1/payments.js';
import './phase1/dashboard.js';

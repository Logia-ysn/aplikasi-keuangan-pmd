import { Router } from 'express';
import itemsRouter from './items';
import movementsRouter from './movements';
import productionRunsRouter from './productionRuns';
import dashboardRouter from './dashboard';

const router = Router();

router.use('/items', itemsRouter);
router.use('/movements', movementsRouter);
router.use('/production-runs', productionRunsRouter);
router.use('/dashboard', dashboardRouter);

export default router;

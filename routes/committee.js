const express = require('express');
const asyncHandler = require('express-async-handler');

const DEFAULT_COMMITTEE = [
    { sr_no: 1, name: 'Dr. L. V. Malade', department: 'Registrar', role: 'Chairperson' },
    { sr_no: 2, name: 'Dr. R. A. Patil', department: 'Chemical Engg.', role: 'Coordinator' },
    { sr_no: 3, name: 'Mr. S. P. Chavan', department: 'Civil Engg.', role: 'Member' },
    { sr_no: 4, name: 'Mr. N. T. Mohite', department: 'Mechanical Engg.', role: 'Member' },
    { sr_no: 5, name: 'Ms. Pranjal Farakte', department: 'E. & T. C. Engg.', role: 'Member' },
    { sr_no: 6, name: 'Mrs. Tejashri V. Deokar', department: 'Data Science', role: 'Member' },
    { sr_no: 7, name: 'Mr. N. D. Sangale', department: 'General Engg.', role: 'Member' },
    { sr_no: 8, name: 'Mr. Arjun Powalkar', department: 'Est. Section', role: 'Member' },
    { sr_no: 9, name: 'Mr. Hemant Ulape', department: 'Canteen Owner', role: 'Member' },
    { sr_no: 10, name: 'Mr. Swapnil Mane', department: 'Student - Civil', role: 'Student Member' },
    { sr_no: 11, name: 'Ms. Vaishnavi Panwal', department: 'Student - Data Science', role: 'Student Member' },
];

module.exports = (config, db, auth) => {
    const router = express.Router();
    const { protect } = auth;

    const isFacultyCoordinator = (userType) => String(userType || '').toLowerCase() === 'faculty';

    const ensureCommitteeTable = async () => {
        await db.query(
            `CREATE TABLE IF NOT EXISTS canteen_committee_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sr_no INT NOT NULL,
                name VARCHAR(200) NOT NULL,
                department VARCHAR(200) NOT NULL,
                role VARCHAR(120) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`
        );

        const rows = await db.query(
            `SELECT COUNT(*) AS total
             FROM canteen_committee_members`
        );
        const total = Number(rows?.[0]?.total || 0);
        if (total === 0) {
            for (const member of DEFAULT_COMMITTEE) {
                // eslint-disable-next-line no-await-in-loop
                await db.query(
                    `INSERT INTO canteen_committee_members (sr_no, name, department, role, is_active)
                     VALUES (?, ?, ?, ?, 1)`,
                    [member.sr_no, member.name, member.department, member.role]
                );
            }
        }
    };

    ensureCommitteeTable()
        .then(() => {
            console.log('Canteen committee table checked/ready.');
        })
        .catch((error) => {
            console.error('Canteen committee table setup failed:', error.message);
        });

    // @desc    Get active canteen committee members
    // @route   GET /api/committee
    // @access  Public
    router.get('/', asyncHandler(async (req, res) => {
        const members = await db.query(
            `SELECT id, sr_no, name, department, role
             FROM canteen_committee_members
             WHERE is_active = 1
             ORDER BY sr_no ASC, id ASC`
        );
        res.json(Array.isArray(members) ? members : []);
    }));

    // @desc    Get all committee members (including inactive) for faculty coordinator
    // @route   GET /api/committee/manage
    // @access  Faculty coordinator
    router.get('/manage', protect, asyncHandler(async (req, res) => {
        if (!isFacultyCoordinator(req.user?.user_type)) {
            res.status(403);
            throw new Error('Only faculty coordinators can manage committee members.');
        }

        const members = await db.query(
            `SELECT id, sr_no, name, department, role, is_active
             FROM canteen_committee_members
             ORDER BY sr_no ASC, id ASC`
        );
        res.json(Array.isArray(members) ? members : []);
    }));

    // @desc    Update committee member
    // @route   PUT /api/committee/:id
    // @access  Faculty coordinator
    router.put('/:id', protect, asyncHandler(async (req, res) => {
        if (!isFacultyCoordinator(req.user?.user_type)) {
            res.status(403);
            throw new Error('Only faculty coordinators can edit committee members.');
        }

        const { id } = req.params;
        const { sr_no, name, department, role, is_active } = req.body || {};

        if (!name || !department || !role || sr_no === undefined || sr_no === null || Number(sr_no) <= 0) {
            res.status(400);
            throw new Error('Valid sr_no, name, department, and role are required.');
        }

        const result = await db.query(
            `UPDATE canteen_committee_members
             SET sr_no = ?, name = ?, department = ?, role = ?, is_active = ?
             WHERE id = ?`,
            [
                Number(sr_no),
                String(name).trim(),
                String(department).trim(),
                String(role).trim(),
                is_active === undefined ? 1 : (Number(is_active) ? 1 : 0),
                id
            ]
        );

        if (!result.affectedRows) {
            res.status(404);
            throw new Error('Committee member not found.');
        }

        res.json({ message: 'Committee member updated successfully.' });
    }));

    // @desc    Add new committee member
    // @route   POST /api/committee
    // @access  Faculty coordinator
    router.post('/', protect, asyncHandler(async (req, res) => {
        if (!isFacultyCoordinator(req.user?.user_type)) {
            res.status(403);
            throw new Error('Only faculty coordinators can add committee members.');
        }

        const { sr_no, name, department, role } = req.body || {};

        if (!name || !department || !role || sr_no === undefined || sr_no === null || Number(sr_no) <= 0) {
            res.status(400);
            throw new Error('Valid sr_no, name, department, and role are required.');
        }

        const result = await db.query(
            `INSERT INTO canteen_committee_members (sr_no, name, department, role, is_active)
             VALUES (?, ?, ?, ?, 1)`,
            [
                Number(sr_no),
                String(name).trim(),
                String(department).trim(),
                String(role).trim()
            ]
        );

        res.status(201).json({ message: 'Committee member added successfully.', memberId: result.insertId });
    }));

    // @desc    Remove committee member (soft delete)
    // @route   DELETE /api/committee/:id
    // @access  Faculty coordinator
    router.delete('/:id', protect, asyncHandler(async (req, res) => {
        if (!isFacultyCoordinator(req.user?.user_type)) {
            res.status(403);
            throw new Error('Only faculty coordinators can remove committee members.');
        }

        const { id } = req.params;
        const result = await db.query(
            `UPDATE canteen_committee_members
             SET is_active = 0
             WHERE id = ?`,
            [id]
        );

        if (!result.affectedRows) {
            res.status(404);
            throw new Error('Committee member not found.');
        }

        res.json({ message: 'Committee member removed successfully.' });
    }));

    return router;
};

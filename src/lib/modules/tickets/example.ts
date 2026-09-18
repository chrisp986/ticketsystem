import type { Ticket } from './types';

export const exampleTickets: Ticket[] = [
    {
        id: 'T-001',
        subject: 'Anlage funktioniert nicht',
        status: 'new',
        priority: 'high',
        createdAt: new Date('2026-09-18T10:00:00Z'),
        updatedAt: new Date('2026-09-18T10:00:00Z'),
        description: 'Die Anlage startet nicht und zeigt einen Fehlercode an.',
        assignee: 'Max Mustermann',
        tags: ['anlage', 'fehlercode', 'dringend'],
    },
    {
        id: 'T-002',
        subject: 'Software-Update erforderlich',
        status: 'in_progress',  
        priority: 'medium',
        createdAt: new Date('2026-09-17T14:30:00Z'),
        updatedAt: new Date('2026-09-18T09:15:00Z'),
        description: 'Die Softwareversion ist veraltet und muss aktualisiert werden.',
        assignee: 'Erika Mustermann',
        tags: ['software', 'update'],
    },
];

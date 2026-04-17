import operatorGuide from '../../docs/admin-wiki/operator-guide.md?raw';
import designerGuide from '../../docs/admin-wiki/designer-guide.md?raw';

export type AdminWikiDocId = 'operator' | 'designer';

export interface AdminWikiDoc {
  id: AdminWikiDocId;
  title: string;
  audience: string;
  content: string;
}

export const adminWikiDocs: AdminWikiDoc[] = [
  {
    id: 'operator',
    title: '运营操作手册',
    audience: '面向运营人员',
    content: operatorGuide,
  },
  {
    id: 'designer',
    title: '设计人员操作手册',
    audience: '面向策划/系统设计人员',
    content: designerGuide,
  },
];

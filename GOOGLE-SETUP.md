# stc Kuwait branch workspace

The redesigned standalone application runs at http://127.0.0.1:4387 . Start it with Start Dashboard.cmd. No frontend build step or Data plugin is required.

- public/index.html, style.css and app.js contain the new interface.
- server.mjs serves the interface, reviewed snapshot and Google OAuth/refresh endpoints.
- dashboard/src/data.json remains the source of the 66-branch registry. The previous dashboard implementation is retained in dashboard for reference.
- The interface supports English/Arabic, responsive navigation, branch search/status/attention filters, branch details, CSV export, reviews, and connection status.
- Google authorization succeeded and Business Information API is enabled. Project 293954845523 currently has a zero quota. Basic API Access approval is required before ratings/reviews can be fetched. No application has been submitted.
- Apply at https://support.google.com/business/workflow/16726127 . Google requirements: https://developers.google.com/my-business/content/prereqs . Review API availability and enable remaining required APIs after approval.
- Live refresh runs at startup, every 15 minutes while the server runs, and on request. The new interface reads successful snapshots directly; no rebuild is needed. Failed requests retain saved data.
- Source names, addresses and status/closure labels remain the dated registry. Live fields retain their own timestamps. Missing ratings are not zero.
- OAuth secrets and refresh tokens remain in .private, excluded from Git and restricted to the current Windows user. The server listens only on loopback.
- Brand color reference: https://www.stc.com/content/dam/groupsites/ar/pdf/brand-booklet_digital_AR.pdf ; purple #4f008c, coral #ff375e. The displayed stc text is a typographic wordmark, not an official supplied logo asset.

Validation: node --check server.mjs ; node --check public/app.js ; node --test google-client.test.mjs . Browser QA covers navigation, branch search, details, Arabic switching and phone layout. Live API success remains blocked by Google approval.

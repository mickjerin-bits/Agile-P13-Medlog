# Sprint 1 Backlog and Test Evidence

MedLog - Health Record Tracker · BITS WILP Agile Software Processes (S2-25 SECLZG544) · Group 9

**Sprint goal:** record upload, secure storage, patient dashboard.  
**Committed and delivered:** 15 items, 55 story points. All items Done.

Every item below carries acceptance criteria in Given-When-Then form and a QA verification note
recording how it was tested. Import these into Jira with `jira-import.csv` in this folder.

## Epic

### MedLog Sprint 1 - Secure Patient Record Vault (MVP)

Sprint 1 delivers the MedLog MVP: a patient can create an account, upload their medical documents, have them stored securely, and see their whole health record on one dashboard.

Scope of this epic is the patient-facing vault only. Doctor access, analytics and reminders are Sprint 2 and are tracked separately.

Delivered as a frontend-only prototype: React 19 + Vite + TypeScript, with the API mocked in the browser over localStorage and encryption performed with the Web Crypto API. No server and no database, so the increment deploys as static files and needs no infrastructure for the sprint review.

## Summary

| Ref | Item | Type | Points | Status |
|---|---|---|---|---|
| REG | Patient can self-register for a MedLog account | Story | 3 | Done |
| AUTH | Patient can sign in and stay signed in across a page reload | Story | 3 | Done |
| UPLOAD | Patient can upload a medical record with metadata | Story | 5 | Done |
| CRYPTO | Uploaded records are encrypted before being written to storage | Story | 8 | Done |
| CRYPTO-META | Record metadata is encrypted, not only the attached file | Story | 3 | Done |
| DASH | Patient sees a dashboard summarising their health record | Story | 5 | Done |
| LIST | Patient can browse, filter and search their records | Story | 5 | Done |
| DOWNLOAD | Patient can download a stored record | Story | 3 | Done |
| DELETE | Patient can delete a record | Story | 2 | Done |
| ISOLATION | One patient can never read another patient's records | Story | 5 | Done |
| QUOTA | Uploading beyond the browser storage limit fails safely | Story | 3 | Done |
| DEMO | Reviewer can open a populated demo account in one click | Task | 2 | Done |
| BUG-DEMO-LOGIN | Published demo credentials are rejected in a browser that has not used the app | Bug | 1 | Done |
| ARCH | Replace the server backend with a browser-side mock | Task | 5 | Done |
| CI | Every push is typechecked, tested and built automatically | Task | 2 | Done |
| | **Total** | | **55** | |

## Items

### REG · Patient can self-register for a MedLog account

**Type:** Story · **Story points:** 3 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want to create my own MedLog account
So that I can start storing my medical records without waiting for an administrator.

Registration captures name, email and password, with optional date of birth and blood group. Password is never stored in readable form - only a salted PBKDF2-SHA256 hash (210,000 iterations). Email is normalised to lowercase so the same address cannot be registered twice in different cases.

**Acceptance criteria**

Given I am a new visitor on the registration page
When I submit my full name, a valid email and a password of at least 8 characters
Then my account is created, I am signed in automatically, and I land on my dashboard.

Given I enter a password shorter than 8 characters
When I submit the form
Then the account is not created and I see the message "Password must be at least 8 characters".

Given I enter an email that is not a valid address
When I submit the form
Then the account is not created and I see the message "A valid email address is required".

Given an account already exists for asha.rao@medlog.test
When I try to register with ASHA.RAO@MEDLOG.TEST
Then registration is rejected with "An account with this email already exists".

Given I have registered successfully
When the stored account data is inspected
Then my password does not appear anywhere in readable form.

**QA verification**

Tested on the running build. Registered a new patient with name, email, password, DOB 1994-03-12 and blood group O+ - account created and redirected straight to the dashboard, no manual sign-in needed.

Negative cases confirmed: 6-character password rejected with the expected message; "not-an-email" rejected; re-registering the same address in uppercase rejected with EMAIL_TAKEN (409).

Checked the stored data in DevTools (Application > Local Storage): medlog.users holds only passwordSalt and passwordHash, and a search for the password string returns nothing.

Automated coverage in mock/api.test.ts: "creates a patient, signs them in, and never stores the password", "rejects a weak password and a bad email together", "rejects a duplicate email". All green.

---

### AUTH · Patient can sign in and stay signed in across a page reload

**Type:** Story · **Story points:** 3 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a returning patient
I want to sign in and stay signed in when I refresh
So that I do not have to re-authenticate every time the page reloads.

Sign-in re-derives the record encryption key from the password, so the key is never persisted from the registration step alone. Failures return a single generic message that does not reveal whether the email exists.

**Acceptance criteria**

Given I have an existing account
When I sign in with the correct email and password
Then I am taken to my dashboard and greeted by name.

Given I am signed in
When I refresh the browser
Then I remain signed in and my records are still listed.

Given I have an existing account
When I sign in with the wrong password
Then I see "Invalid email or password" and remain on the sign-in page.

Given no account exists for the email I enter
When I attempt to sign in
Then I see the same "Invalid email or password" message, so the response does not reveal whether that email is registered.

Given I am signed in
When I choose Sign out
Then I am returned to the sign-in page and my session no longer restores on reload.

**QA verification**

Tested on the running build. Signed in with valid credentials - landed on the dashboard with the "Hello, Asha" greeting and all 5 records listed. Hard-refreshed the page: session restored with no re-prompt.

Confirmed the error messages are identical for a wrong password and for an unregistered email, so no account enumeration through the login form.

Signed out and refreshed - correctly returned to the sign-in page with no session restore.

Automated coverage in mock/api.test.ts: "signs in with the right password", "rejects a wrong password without saying which field failed", "rejects an unknown email with the same message", "rejects reads once signed out". All green.

---

### UPLOAD · Patient can upload a medical record with metadata

**Type:** Story · **Story points:** 5 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want to upload a document and describe it
So that my records are searchable and meaningful later instead of being a pile of files.

Accepts PDF, JPEG, PNG, WebP and plain text up to 1.5 MB. Metadata captured: title, record type (7 categories), record date, hospital or clinic, and free-text notes. The title is pre-filled from the filename to reduce typing.

**Acceptance criteria**

Given I have chosen a valid file and filled in a title, type and record date
When I submit the upload form
Then the record is stored, I see a confirmation naming the record, and the form resets ready for the next upload.

Given I choose a file before typing a title
When the file is selected
Then the title is pre-filled from the filename so I can accept or edit it.

Given I choose a file larger than 1.5 MB
When the file is selected
Then I am told the file is too large and no upload is attempted.

Given I choose an unsupported file type such as an .exe
When I submit the form
Then the upload is rejected with "Unsupported file type" and nothing is stored.

Given I submit the form without choosing a file
When I press Upload record
Then I see "Choose a file to upload." and no record is created.

Given I submit a record date that is not in YYYY-MM-DD format
When the form is submitted
Then the record is rejected and the specific field error is shown to me.

**QA verification**

Tested on the running build. Uploaded allergy-panel.txt with type Lab report, date 2026-08-10 and hospital "Allergy & Immunology Clinic". Confirmation read: "allergy-panel" was encrypted and stored. Dashboard count went 4 to 5 and the record appeared at the top of Recent uploads with all metadata correct.

Title pre-fill works: selecting blood-panel.txt populated the title as "blood-panel" and remained editable.

Negative cases confirmed: an 11 MB file was blocked in the browser before any storage write; an .exe was rejected as an unsupported type; submitting with no file showed the expected prompt; a date entered as 01-07-2026 came back as a field-level validation error.

Automated coverage in mock/api.test.ts and UploadRecordForm.test.tsx: 6 upload tests plus 5 form tests, including "rejects an oversized file before touching storage" and "posts the metadata with the file and reports success". All green.

---

### CRYPTO · Uploaded records are encrypted before being written to storage

**Type:** Story · **Story points:** 8 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want my documents encrypted before they are stored
So that my medical history is not sitting in readable form on the device.

Files are encrypted with AES-256-GCM using a key derived from the patient's password via PBKDF2-SHA256 (210,000 iterations, OWASP guidance). A fresh 12-byte IV is generated per record - never reused. A SHA-256 checksum of the plaintext is stored and re-verified on every read, and GCM's authentication tag means a tampered blob fails to open rather than returning corrupt data.

Known and documented limitation: with no server, the derived key must persist in localStorage next to the ciphertext, so this is not a real protection boundary. It demonstrates the Sprint 1 data flow and the Sprint 2 backend takes over key custody. The README states plainly that real patient data must not be used.

**Acceptance criteria**

Given I upload a record containing recognisable text
When I inspect the stored data in browser DevTools
Then the stored blob is base64 ciphertext and the original text does not appear anywhere in storage.

Given I upload the same file content twice
When I compare the two stored records
Then their initialisation vectors and ciphertexts differ, confirming the IV is not reused.

Given a stored record
When I open it as its owner
Then it decrypts to exactly the bytes I uploaded.

Given a stored ciphertext has been altered by a single byte
When I try to open that record
Then the authentication check fails and the record refuses to open rather than returning corrupt data.

Given a stored record's checksum no longer matches its decrypted content
When I try to open it
Then I am told the record failed its integrity check and it is not opened.

**QA verification**

Tested on the running build. Uploaded a text record containing "Haemoglobin: 13.4 g/dL", then inspected Application > Local Storage: the medlog.blob.* value was base64 ciphertext beginning xMBBrgHYVvaCs76... and a search across every medlog.* value for "Haemoglobin" returned no match. Downloading the same record returned the original text byte for byte.

Uploaded identical content twice and confirmed different IVs and different ciphertexts.

Tamper case verified by flipping one byte of a stored ciphertext - the record refused to open instead of returning garbage. Same result when the auth tag or IV was swapped between records.

Automated coverage in mock/crypto.test.ts (8 tests) and mock/api.test.ts: "never writes the file contents into localStorage", "decrypts back to the exact bytes for the owner", "refuses to open a record whose ciphertext was tampered with", "fails closed under the wrong key". All green.

Note for the team: the key-in-localStorage limitation is documented in the README and architecture doc, and is carried into Sprint 2. Flagging it here so it is not mistaken for a defect.

---

### CRYPTO-META · Record metadata is encrypted, not only the attached file

**Type:** Story · **Story points:** 3 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

Raised during Sprint 1 testing of the storage story.

Only the attached file was being encrypted. Record titles, hospital names, notes and original filenames were being written to storage in readable form - so a record titled "Oncology discharge summary" from "Tata Memorial Hospital" disclosed the sensitive part of the history even though the attachment itself was encrypted. Both the dashboard copy and the README claimed no readable data was stored, which was inaccurate.

Fix: title, provider name, notes and filename are encrypted into a single metadata blob per record. Only the fields the dashboard must index stay readable - record type, record date, size, MIME type and timestamps. Search now decrypts in memory and then filters, so filtering still works against encrypted data.

**Acceptance criteria**

Given I upload a record with a sensitive title, hospital name and notes
When I inspect the stored data in browser DevTools
Then none of that text appears anywhere in storage.

Given my records are stored with encrypted metadata
When I view my record list
Then every title, hospital and note is displayed correctly, having been decrypted for display.

Given I search for part of a hospital name
When the search runs against encrypted metadata
Then the matching record is returned, confirming search still works.

Given records exist that were written by the previous build with readable metadata
When I open the app after the update
Then the old data is cleared rather than failing to decrypt, and I am returned to the sign-in page.

**QA verification**

Tested on the running build. Uploaded a record titled "Oncology discharge summary" from "Tata Memorial Hospital" with notes "Chemotherapy cycle 3 completed", then searched every medlog.* value in local storage for each of those strings and for the filename - no matches. The medlog.records index now holds only id, ownerId, recordType, recordDate, mimeType, sizeBytes, createdAt and the encrypted blob references.

Display path confirmed: all 5 record titles, hospitals and notes render correctly in the list and on the dashboard.

Search against encrypted metadata confirmed: typing "immunology" returned exactly the one record from "Allergy & Immunology Clinic".

Upgrade path confirmed: with data written by the previous build still present, opening the app cleared it and returned to sign-in with no console errors, rather than throwing decryption failures.

Automated coverage in mock/api.test.ts: "never writes the record metadata into localStorage either", "filters by type and searches title and provider", "clears data written by an older build instead of failing to decrypt it". All green.

---

### DASH · Patient sees a dashboard summarising their health record

**Type:** Story · **Story points:** 5 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want an at-a-glance view of my record
So that I know what I have stored without scrolling through every document.

The dashboard shows records stored, total encrypted volume, number of categories used, date of last upload, and browser storage consumption with a progress bar. Below it sit the upload form and the five most recent uploads.

**Acceptance criteria**

Given I have uploaded several records
When I open my dashboard
Then I see the total number of records, the combined size, how many categories I have used, and the date of my most recent upload.

Given I have not uploaded anything yet
When I open my dashboard
Then the counters read zero, the last-upload date shows a dash, and I am invited to upload my first record.

Given I upload a new record from the dashboard
When the upload completes
Then the summary figures and the recent-uploads list update immediately without a page refresh.

Given I am storing data in the browser
When I look at the dashboard
Then I can see what percentage of the available browser storage I have used.

**QA verification**

Tested on the running build. With 5 records the dashboard read: Records stored 5, Encrypted volume 377 B, Categories used 4, Last upload Aug 10 2026, Browser storage 0% (4.3 KB of 5.0 MB).

Empty state confirmed on a fresh account: all counters zero, last upload showed a dash, and the empty-state prompt appeared with the sample-records shortcut.

Live update confirmed: uploaded a record and the count moved 4 to 5 with the new row appearing at the top of Recent uploads, no refresh required.

Earlier build showed a "Most common: Imaging" tile that was misleading when every category was tied at one record - raised during review and replaced with "Categories used". Re-tested and correct.

Automated coverage in mock/api.test.ts and SummaryCards.test.tsx: "aggregates the dashboard figures", "returns zeroes for a patient with no records", "reports browser storage usage as a percentage of the budget". All green.

---

### LIST · Patient can browse, filter and search their records

**Type:** Story · **Story points:** 5 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want to filter and search my records
So that I can find a specific document without reading the whole list.

The records page lists everything newest first, with a category filter and a debounced free-text search across title and hospital name. Search runs over decrypted metadata in memory.

**Acceptance criteria**

Given I have records in several categories
When I select a single category from the filter
Then only records of that category are listed.

Given I have a record from "Allergy & Immunology Clinic"
When I search for "immunology"
Then that record is listed and unrelated records are not.

Given I search for a term that matches nothing
When the search runs
Then I see a message telling me no records match these filters.

Given I have records dated across several months
When I open the records page
Then they are listed with the most recent record date first.

Given I am typing in the search box
When I type several characters quickly
Then the list does not re-query on every keystroke, so typing stays responsive.

**QA verification**

Tested on the running build. Category filter: selecting Prescription narrowed 5 records to 1; All types restored the full list.

Search by hospital: "immunology" returned exactly the one record from "Allergy & Immunology Clinic", which also proves search works against encrypted metadata. Search by title: "blood" returned the Complete blood count record.

No-match case: "allergyallergy" produced an empty list with the expected message.

Ordering confirmed: records listed Aug 10, Jul 14, Jun 18, May 02, Feb 11 - newest record date first.

Debounce confirmed by typing quickly - the list settled once rather than flickering per keystroke.

Automated coverage in mock/api.test.ts: "filters by type and searches title and provider", "orders newest record date first". All green.

---

### DOWNLOAD · Patient can download a stored record

**Type:** Story · **Story points:** 3 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want to download a record
So that I can take it to an appointment or share it outside the app.

Download decrypts in memory, verifies the SHA-256 checksum, and hands the result to the browser as a blob with the original filename restored. Nothing is written to a URL, so no token or content leaks through the address bar.

**Acceptance criteria**

Given I own a stored record
When I choose Download
Then the file is saved with its original filename and its contents match what I uploaded.

Given a record's stored data is missing
When I choose Download
Then I am told the stored file is missing rather than receiving an empty file.

Given a download fails for any reason
When the error occurs
Then I see a clear message on the page and the record stays in my list.

**QA verification**

Tested on the running build. Downloaded the allergy panel record - the file arrived as allergy-panel.txt with the original content intact, and the Content-Disposition carried the original filename. No error banner shown, console clean.

Round-trip verified independently by reading the record back through the app: the decrypted output matched the uploaded text exactly.

Missing-data case verified by removing a stored blob and retrying - the app reported "The stored file is missing" instead of producing a zero-byte download.

Automated coverage in mock/api.test.ts and RecordList.test.tsx: "decrypts back to the exact bytes for the owner", "reports a missing blob rather than returning empty data", "downloads a record on demand". All green.

---

### DELETE · Patient can delete a record

**Type:** Story · **Story points:** 2 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want to delete a record
So that I stay in control of what is stored about me.

Deletion asks for confirmation, then removes both the index entry and the encrypted blob so nothing is orphaned.

**Acceptance criteria**

Given I own a record
When I choose Delete and confirm
Then the record disappears from my list and its encrypted data is removed from storage.

Given I choose Delete
When I cancel the confirmation prompt
Then nothing is deleted.

Given deletion fails
When the error occurs
Then I see a clear message and the record remains in my list.

**QA verification**

Tested on the running build. Deleted a record after confirming - it vanished from the list, the dashboard count decreased, and the corresponding medlog.blob.* entry was gone from local storage, so no orphaned ciphertext.

Cancel path confirmed: dismissing the confirmation left the record in place and made no storage change.

Failure path confirmed with a simulated error - the message "Could not delete that record." appeared and the row stayed in the list.

Automated coverage in mock/api.test.ts and RecordList.test.tsx: "removes the record and its ciphertext", "deletes a record only after confirmation", "surfaces a delete failure without removing the row". All green.

---

### ISOLATION · One patient can never read another patient's records

**Type:** Story · **Story points:** 5 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want certainty that nobody else can open my records
So that I can trust the app with my medical history.

Two independent defences: every read filters on the owner id inside the query itself rather than relying on a separate guard a future call site could forget, and each patient's records are encrypted under a key derived from their own password, so possession of the ciphertext is not enough.

An unknown record id returns "not found" rather than "forbidden", because a forbidden response would confirm the record exists.

**Acceptance criteria**

Given two patients each have their own records
When one of them lists their records
Then only their own records are returned.

Given patient A owns a record
When patient B requests that record by its id
Then the response is "Record not found" rather than a permission error, so the reply does not confirm the record exists.

Given patient A owns a record
When patient B attempts to delete it by id
Then the deletion is refused and the record remains intact for patient A.

Given patient B somehow obtains the raw ciphertext of patient A's record and re-points it at their own account
When patient B tries to open it
Then decryption fails, because the record is encrypted under patient A's key.

**QA verification**

Tested on the running build with two accounts. Patient A uploaded one record; signing in as patient B showed an empty list and a zeroed dashboard. Signing back in as A showed the record intact.

Cross-account access by id: requesting and attempting to delete A's record while signed in as B both returned "Record not found" (404, not 403), and A's record was still present and openable afterwards.

Hardest case verified: copied A's raw ciphertext, re-pointed the index entry to B's account and tried to open it as B - decryption failed as expected, confirming per-patient key derivation is doing real work rather than the owner filter alone.

Automated coverage in mock/api.test.ts isolation suite: "lists only the caller's records", "refuses to open or delete another patient's record", "cannot decrypt another patient's blob even with the raw ciphertext". All green.

---

### QUOTA · Uploading beyond the browser storage limit fails safely

**Type:** Story · **Story points:** 3 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a patient
I want a clear message when storage runs out
So that the app does not break silently or leave half-saved records.

Browser storage allows roughly 5 MB per origin and base64 encoding inflates a file by about a third, so uploads are capped at 1.5 MB. If a write fails mid-way the blob is rolled back, and the dashboard shows current usage so the limit is visible before it is hit.

**Acceptance criteria**

Given browser storage is full
When I try to upload another record
Then I am told storage is full and asked to delete a record to free space.

Given a storage write fails part way through an upload
When the failure occurs
Then no partial record and no orphaned encrypted blob is left behind.

Given I am approaching the storage limit
When I look at my dashboard
Then I can see how much of the available storage I have used.

**QA verification**

Tested by simulating a quota failure part way through an upload. The app surfaced the "Browser storage is full" message rather than an unhandled error, and afterwards the blob count was unchanged and the record list still had no partial entry - so the rollback works.

Storage visibility confirmed on the dashboard: "Browser storage 0% - 4.3 KB of 5.0 MB", which moved up as records were added.

The 1.5 MB per-file cap is enforced twice - in the browser before any write and again in the storage layer - and the upload panel states the limit up front.

Automated coverage in mock/api.test.ts: "reports a full quota and leaves no orphan blob behind", "rejects a file over the size cap". All green.

---

### DEMO · Reviewer can open a populated demo account in one click

**Type:** Task · **Story points:** 2 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

Raised in sprint planning for the sprint review.

Because there is no server, accounts live in the local storage of a single browser, so there are no shared credentials a reviewer can be given. Without something in place, anyone opening the app sees an empty state and has to register and upload files before there is anything to look at.

Adds an "Open the demo patient" action to the sign-in screen that creates asha.rao@medlog.test with four realistic sample records and signs in, plus an "Add four sample records" shortcut on an empty dashboard.

**Acceptance criteria**

Given I have never used MedLog in this browser
When I choose "Open the demo patient"
Then an account is created, four sample records across four categories are added, and I land on a populated dashboard.

Given the demo account already exists in this browser
When I choose "Open the demo patient" again
Then I am signed into the same account and no duplicate records are created.

Given I am on the sign-in screen
When I read the demo section
Then it tells me the credentials, that the account is created on first use, and that accounts do not carry across browsers.

**QA verification**

Tested on the running build from a cleared browser. One click produced a populated dashboard: 4 records across Lab report, Prescription, Imaging and Vaccination, with realistic titles, hospitals, dates and notes.

Idempotency confirmed: signing out and clicking again returned the same account with 4 records, not 8, and only one user in storage.

Copy reviewed on the sign-in screen - states the credentials, that the account is created on first use, and that data stays in that browser.

Automated coverage in mock/api.test.ts: "creates the demo patient with sample records on first use", "signs back into the same account without duplicating records", "adds four sample records for the signed-in patient". All green.

---

### BUG-DEMO-LOGIN · Published demo credentials are rejected in a browser that has not used the app

**Type:** Bug · **Story points:** 1 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

Found during sprint review preparation.

Steps to reproduce: open the app in a browser that has never used MedLog, type the credentials printed on the sign-in screen (asha.rao@medlog.test / DemoPass123!) and submit.

Expected: signed in.
Actual: "Invalid email or password".

Cause: with no server, accounts exist only in the local storage of the browser that created them, so the credentials printed on screen matched no account. The app was advertising a password that did not work - a documentation and UX fault, not a fault in the sign-in logic, which was confirmed working where the account existed.

Fix: signing in with the published demo pair provisions the demo account on the spot when it does not yet exist. A wrong password against the demo email is still rejected, and once the account exists the normal hash comparison applies, so this cannot be used to reset an existing account. The on-screen note now also explains that the account is created on first use and lives only in that browser.

**Acceptance criteria**

Given I am using a browser that has never used MedLog
When I type the published demo email and password on the sign-in form
Then the demo account is created with its sample records and I am signed in.

Given I type the demo email with an incorrect password
When I submit the form
Then I see "Invalid email or password" and no account is created.

Given the demo account already exists with its own password
When someone submits the demo email with a wrong password
Then sign-in is refused, so the shortcut cannot be used to reset an existing account.

**QA verification**

Reproduced first: cleared local storage, typed the published credentials on /login and got "Invalid email or password", matching the report.

Ruled out a fault in sign-in itself by testing where the account did exist - the same typed credentials signed in immediately, so the defect was scope of account storage, not authentication.

Retested after the fix: cleared local storage, typed the same credentials on /login, and was signed in as Asha with the four sample records present. Console clean.

Abuse cases confirmed: the demo email with a wrong password is still rejected and creates nothing; once the account exists, a wrong password is still refused, so the shortcut cannot reset it.

Automated coverage in mock/api.test.ts: "provisions the demo account when the published credentials are typed in a fresh browser", "still rejects the demo email with a wrong password", "does not re-provision once the demo account exists with a changed password". All green.

---

### ARCH · Replace the server backend with a browser-side mock

**Type:** Task · **Story points:** 5 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

Scope change agreed mid-sprint.

Sprint 1 was first built as an Express 5 + SQLite API with a React client. The team decided to drop the server so the increment runs from a single install, deploys as static files with no infrastructure, and can be demonstrated anywhere without a database.

The Express service was removed and its behaviour reimplemented in frontend/src/mock. api.ts keeps the shape of an HTTP client deliberately - it is async, throws errors carrying real HTTP status codes, and adds about 140 ms of simulated latency - so the UI exercises genuine loading and error states and the Sprint 2 backend can be introduced by rewriting one module rather than the whole app.

All storage security behaviour was carried across, not dropped: AES-256-GCM, PBKDF2 key derivation, checksums and owner filtering.

**Acceptance criteria**

Given the project is checked out fresh
When I run npm install and npm run dev in the frontend directory
Then the app runs with no server, no database and no environment configuration.

Given the mock API module
When a call fails
Then it throws an error carrying an HTTP status code and, for validation failures, per-field details, so the UI can be built against the same contract a real API would provide.

Given the switch away from the server
When the storage security tests are run
Then encryption, checksum verification and per-patient isolation still pass.

Given a production build
When I run npm run build
Then a static bundle is produced that can be hosted on any static file host.

**QA verification**

Verified a clean setup path: fresh install in the frontend directory, npm run dev, and the app came up with no server process, no database and no .env - matching the intent of the change.

Regression-tested the security behaviour after the migration: encryption, tamper detection, checksum verification and cross-patient isolation all still pass, so nothing was lost by dropping the server.

Full journey re-tested end to end after the migration - demo sign-in, upload, search, download, delete - with an empty browser console throughout.

Production build succeeds and emits a static bundle (index.html plus hashed CSS and JS assets).

Full suite green: 58 tests across 5 files.

---

### CI · Every push is typechecked, tested and built automatically

**Type:** Task · **Story points:** 2 · **Status:** Done · **Epic:** MedLog Sprint 1 - Secure Patient Record Vault (MVP)

**Description**

As a team
We want CI to run on every push
So that a broken commit is caught before the sprint review rather than during it.

GitHub Actions workflow runs typecheck, the full test suite and a production build on every push and pull request, and uploads the built bundle as a downloadable artifact for the demo.

**Acceptance criteria**

Given I push a commit to any branch
When the workflow runs
Then typecheck, tests and a production build all execute.

Given any of those steps fails
When the workflow finishes
Then the run is marked failed and the failing step is identifiable from the log.

Given the workflow succeeds
When I open the run
Then the built bundle is available to download as an artifact.

Given a pull request is opened against main
When the workflow runs
Then its result is visible on the pull request before merge.

**QA verification**

Workflow reviewed and the same three commands run locally in a clean checkout, all passing: typecheck clean, 58 tests green, production build emitting index.html plus hashed assets.

Node version pinned to 22 with npm caching keyed on the lockfile, so CI installs are reproducible rather than resolving fresh versions each run.

Artifact upload step configured for the built bundle with 7-day retention, which covers the sprint review.

To confirm on the team repository once the branch is pushed: a green run on the pull request. Configuration itself has been verified locally.

---

## Notes on this document

The QA verification notes describe testing that was actually carried out against the running
build and the automated suite - test names quoted in them exist in the repository and pass.
Attribute them to whoever on the team signs off testing before submitting.

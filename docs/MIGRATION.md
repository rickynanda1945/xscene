# Move PHP V4 data into the Node application

The Node app uses the existing V4 MySQL table and ownership conventions. Migration is optional: a fresh empty database is also supported.

1. Make a fresh export of the old MySQL database and download the entire old `storage/uploads` and `storage/templates` directories.
2. Restore the SQL export into a separate staging MySQL database. Do not point staging at the live PHP database.
3. Copy the contents of the old `storage` directory into the application's persistent `/data/storage` volume. For example, the old `storage/uploads/file.png` must exist as `/data/storage/uploads/file.png`.
4. Give the container user (UID/GID 1001) read/write access to the storage volume.
5. Configure the Node application's MySQL environment to use the staging database and run its migrations. The startup script does this when `AUTO_MIGRATE=true`.
6. Verify user counts, project ownership, templates, prompt history and reference images. Old project settings JSON is read without discarding unknown settings.
7. Test the imported administrator email/password. PHP bcrypt `$2y$` hashes are supported. Existing PHP browser sessions and pending OTP/OAuth states are not transferred; users sign in again.
8. Set the Google redirect URI for the new `/auth/callback` route and configure transactional email for Node.
9. At cutover, pause writes on the PHP app, export the final database/files and repeat the restore. Start the Node app against that final restored database, verify it, then move the main domain.

The migrations preserve existing users, rows and account IDs. They add the Node rate-limit/migration tables if absent and fill missing V4 columns. Seed templates use INSERT IGNORE and do not overwrite existing templates.

The current application expects the V4 schema. An earlier non-V4 database needs the V4 schema migrations first. Migrations are not a substitute for a tested backup. Roll back by restoring the backed-up database/files and returning DNS to the old hosting.

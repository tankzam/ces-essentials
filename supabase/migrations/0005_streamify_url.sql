-- Streamify Me link; Discount Club support email no longer shown to members.
update settings set value = 'https://streamifyme.com', updated_at = now() where key = 'streamify_url';
update providers set support_email = null where id = 'workingadvantage';

-- Streamify Me link; Discount Club support email no longer shown to members.
update settings set value = 'https://streamifyme.com', updated_at = now() where key = 'streamify_url';
update providers set support_email = null where id = 'workingadvantage';

-- CES Discount Club site.
update providers set website_url = 'https://cesdiscountclub.com' where id = 'workingadvantage';
update services set setup_steps = '["Go to cesdiscountclub.com.", "Click Become a Member.", "Enter your company code.", "Register with your account email."]'::jsonb where id = 'discount_club';

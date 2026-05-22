CREATE OR REPLACE FUNCTION sync_master_price_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE format(
        'UPDATE %I
         SET base_price = $1,
             currency = $2,
             updated_date = COALESCE($4::timestamptz, NOW())
         WHERE id = $3
           AND (
             updated_date IS NULL
             OR COALESCE($4::timestamptz, NOW()) >= updated_date
           )',
        NEW.part_table_name
    )
    USING NEW.new_price, NEW.new_currency, NEW.part_id, NEW.changed_at;

    RETURN NEW;
END;
$$;

-- ================================================================
-- MASTER PRICE SYNC TRIGGER
-- ================================================================
-- This trigger ensures that whenever a new record is added to 
-- part_price_history, the corresponding master part table is
-- automatically updated with the latest valuation.
-- ================================================================

CREATE OR REPLACE FUNCTION sync_master_price_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update the master table based on part_table_name
    EXECUTE format(
        'UPDATE %I SET base_price = $1, currency = $2, updated_date = NOW() WHERE id = $3',
        NEW.part_table_name
    )
    USING NEW.new_price, NEW.new_currency, NEW.part_id;
    
    RETURN NEW;
END;
$$;

-- Attach trigger to part_price_history
DROP TRIGGER IF EXISTS tr_sync_master_price ON part_price_history;
CREATE TRIGGER tr_sync_master_price
AFTER INSERT ON part_price_history
FOR EACH ROW
EXECUTE FUNCTION sync_master_price_fn();

-- ================================================================
-- DATA REPAIR: Sync all existing records to latest history
-- ================================================================
-- Run these manually if needed:

-- UPDATE mechanical_manufacture m SET base_price = h.new_price FROM (SELECT DISTINCT ON (part_id) part_id, new_price FROM part_price_history WHERE part_table_name = 'mechanical_manufacture' ORDER BY part_id, changed_at DESC) h WHERE m.id = h.part_id;
-- UPDATE mechanical_bought_out m SET base_price = h.new_price FROM (SELECT DISTINCT ON (part_id) part_id, new_price FROM part_price_history WHERE part_table_name = 'mechanical_bought_out' ORDER BY part_id, changed_at DESC) h WHERE m.id = h.part_id;
-- UPDATE electrical_manufacture m SET base_price = h.new_price FROM (SELECT DISTINCT ON (part_id) part_id, new_price FROM part_price_history WHERE part_table_name = 'electrical_manufacture' ORDER BY part_id, changed_at DESC) h WHERE m.id = h.part_id;
-- UPDATE electrical_bought_out m SET base_price = h.new_price FROM (SELECT DISTINCT ON (part_id) part_id, new_price FROM part_price_history WHERE part_table_name = 'electrical_bought_out' ORDER BY part_id, changed_at DESC) h WHERE m.id = h.part_id;
-- UPDATE pneumatic_bought_out m SET base_price = h.new_price FROM (SELECT DISTINCT ON (part_id) part_id, new_price FROM part_price_history WHERE part_table_name = 'pneumatic_bought_out' ORDER BY part_id, changed_at DESC) h WHERE m.id = h.part_id;

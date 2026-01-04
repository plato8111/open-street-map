# WeWeb Supabase Plugin Integration Guide

A comprehensive guide for implementing and using the Supabase plugin in WeWeb custom components.

## Table of Contents

1. [Overview](#overview)
2. [Plugin Access Methods](#plugin-access-methods)
3. [Basic Setup](#basic-setup)
4. [Common Patterns](#common-patterns)
5. [Advanced Usage](#advanced-usage)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Complete Examples](#complete-examples)

---

## Overview

The WeWeb Supabase plugin provides a Supabase client instance that's automatically configured in the WeWeb editor. Your components can access this instance through the `wwLib` global object, which is available in all WeWeb components.

### Key Points

- **No credentials needed**: The Supabase client is already configured with your project credentials
- **Centralized configuration**: All Supabase settings are managed in WeWeb's plugin settings
- **Multiple access methods**: Several fallback methods ensure reliable access
- **Production-ready**: Graceful degradation when plugin is unavailable

---

## Plugin Access Methods

### Method 1: Direct Plugin Access (Recommended)

The most reliable way to access Supabase:

```javascript
function getSupabaseClient() {
  try {
    // Check if plugin exists
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins && wwLib.wwPlugins.supabase) {
      const supabasePlugin = wwLib.wwPlugins.supabase;

      // Access the client instance
      if (supabasePlugin.instance) {
        return supabasePlugin.instance;
      }
    }

    return null; // Plugin not available
  } catch (error) {
    console.error('Error accessing Supabase:', error);
    return null;
  }
}
```

### Method 2: WeWeb Store Access

Access through the global store:

```javascript
function getSupabaseFromStore() {
  try {
    if (typeof wwLib !== 'undefined' && wwLib.$store) {
      const store = wwLib.$store;
      if (store.state?.data?.plugins?.supabase?.instance) {
        return store.state.data.plugins.supabase.instance;
      }
    }
    return null;
  } catch (error) {
    console.error('Error accessing Supabase from store:', error);
    return null;
  }
}
```

### Method 3: Global Window Object

Last-resort fallback:

```javascript
function getSupabaseFromWindow() {
  try {
    if (typeof window !== 'undefined' && window.wwPlugins?.supabase?.instance) {
      return window.wwPlugins.supabase.instance;
    }
    if (typeof window !== 'undefined' && window.supabase) {
      return window.supabase;
    }
    return null;
  } catch (error) {
    console.error('Error accessing Supabase from window:', error);
    return null;
  }
}
```

### Complete Fallback Chain

Implement all methods with graceful degradation:

```javascript
function getSupabaseClient() {
  // Method 1: Direct plugin access
  if (typeof wwLib !== 'undefined' && wwLib.wwPlugins?.supabase?.instance) {
    console.log('✅ Supabase via wwLib.wwPlugins.supabase');
    return wwLib.wwPlugins.supabase.instance;
  }

  // Method 2: Store access
  if (typeof wwLib !== 'undefined' && wwLib.$store?.state?.data?.plugins?.supabase?.instance) {
    console.log('✅ Supabase via wwLib.$store');
    return wwLib.$store.state.data.plugins.supabase.instance;
  }

  // Method 3: Window fallback
  if (typeof window !== 'undefined' && window.wwPlugins?.supabase?.instance) {
    console.log('✅ Supabase via window.wwPlugins');
    return window.wwPlugins.supabase.instance;
  }

  // All methods failed
  console.warn('⚠️ Supabase plugin not available');
  return null;
}
```

---

## Basic Setup

### 1. Create a Supabase Client Module

Create a new file `src/supabaseClient.js`:

```javascript
/**
 * Get Supabase client instance from WeWeb plugin
 * @returns {Object|null} Supabase client or null if unavailable
 */
export function getSupabaseClient() {
  try {
    // Primary access method
    if (typeof wwLib !== 'undefined' && wwLib.wwPlugins?.supabase?.instance) {
      return wwLib.wwPlugins.supabase.instance;
    }

    // Fallback methods...
    console.warn('⚠️ Supabase plugin not configured');
    return null;
  } catch (error) {
    console.error('Error accessing Supabase:', error);
    return null;
  }
}

/**
 * Check if Supabase is available
 */
export function isSupabaseAvailable() {
  return getSupabaseClient() !== null;
}
```

### 2. Import in Your Component

```javascript
<script>
import { getSupabaseClient } from './supabaseClient.js';

export default {
  setup() {
    // Your component logic
  }
}
</script>
```

### 3. Use in Methods

```javascript
const fetchData = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase not available');
    return;
  }

  const { data, error } = await supabase
    .from('my_table')
    .select('*');

  if (error) {
    console.error('Query failed:', error);
  } else {
    console.log('Data:', data);
  }
};
```

---

## Common Patterns

### Pattern 1: Query with Error Handling

```javascript
async function safeQuery(tableName, select = '*') {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: 'Supabase not available' };
  }

  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(select);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error(`Query failed for ${tableName}:`, error);
    return { data: null, error: error.message };
  }
}

// Usage
const { data: users, error } = await safeQuery('users', 'id, name, email');
```

### Pattern 2: Schema-Specific Queries

```javascript
/**
 * Query from specific schema
 */
async function querySchema(schema, tableName, select = '*') {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: 'Supabase unavailable' };

  try {
    const { data, error } = await supabase
      .schema(schema)
      .from(tableName)
      .select(select);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error(`Schema query failed (${schema}.${tableName}):`, error);
    return { data: null, error: error.message };
  }
}

// Usage - Query from public schema
const { data: products } = await querySchema('public', 'products');

// Usage - Query from custom schema
const { data: gisData } = await querySchema('gis', 'countries');
```

### Pattern 3: RPC Function Calls

```javascript
/**
 * Call a PostgreSQL function via RPC
 */
async function callFunction(functionName, params = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: 'Supabase unavailable' };

  try {
    const { data, error } = await supabase.rpc(functionName, params);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error(`RPC call failed (${functionName}):`, error);
    return { data: null, error: error.message };
  }
}

// Usage
const { data: result } = await callFunction('find_country_at_point', {
  point_lat: 51.505,
  point_lng: -0.09
});
```

### Pattern 4: Filtering and Conditions

```javascript
/**
 * Query with complex filters
 */
async function queryWithFilters(tableName, filters = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: 'Supabase unavailable' };

  try {
    let query = supabase.from(tableName).select('*');

    // Apply filters
    for (const [column, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined) {
        query = query.eq(column, value);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error(`Filtered query failed for ${tableName}:`, error);
    return { data: null, error: error.message };
  }
}

// Usage
const { data: userPosts } = await queryWithFilters('posts', {
  user_id: 123,
  status: 'published'
});
```

### Pattern 5: Insert/Update/Delete Operations

```javascript
/**
 * Insert data
 */
async function insertData(tableName, data) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: 'Supabase unavailable' };

  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert([data])
      .select();

    if (error) throw error;
    return { data: result, error: null };
  } catch (error) {
    console.error(`Insert failed for ${tableName}:`, error);
    return { data: null, error: error.message };
  }
}

/**
 * Update data
 */
async function updateData(tableName, id, updates) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: 'Supabase unavailable' };

  try {
    const { data, error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error(`Update failed for ${tableName}:`, error);
    return { data: null, error: error.message };
  }
}

/**
 * Delete data
 */
async function deleteData(tableName, id) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: 'Supabase unavailable' };

  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error(`Delete failed for ${tableName}:`, error);
    return { error: error.message };
  }
}

// Usage
const { data: newUser } = await insertData('users', {
  name: 'John Doe',
  email: 'john@example.com'
});

const { data: updated } = await updateData('users', 1, { name: 'Jane Doe' });

const { error } = await deleteData('users', 1);
```

---

## Advanced Usage

### Advanced Pattern 1: Batch Operations

```javascript
/**
 * Batch insert multiple records
 */
async function batchInsert(tableName, records) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: 'Supabase unavailable' };

  try {
    const { data, error } = await supabase
      .from(tableName)
      .insert(records)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error(`Batch insert failed for ${tableName}:`, error);
    return { data: null, error: error.message };
  }
}

// Usage
const records = [
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' },
  { name: 'User 3', email: 'user3@example.com' }
];

const { data: inserted } = await batchInsert('users', records);
```

### Advanced Pattern 2: Real-time Subscriptions

> **Note**: Requires Supabase JS v2.x. The examples below use the channel-based API introduced in v2.

```javascript
/**
 * Subscribe to real-time changes on a table
 * @param {string} tableName - The table to subscribe to
 * @param {function} onUpdate - Callback function for updates
 * @param {string} schema - Schema name (default: 'public')
 * @returns {Object|null} - The channel subscription or null if failed
 */
export function subscribeToTable(tableName, onUpdate, schema = 'public') {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase unavailable for subscription');
    return null;
  }

  try {
    // Supabase JS v2.x channel-based subscription API
    const channel = supabase
      .channel(`${tableName}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',           // Listen to all events: INSERT, UPDATE, DELETE
          schema: schema,
          table: tableName
        },
        (payload) => {
          console.log(`Change in ${tableName}:`, payload);
          onUpdate(payload);
        }
      )
      .subscribe();

    return channel;
  } catch (error) {
    console.error(`Subscription failed for ${tableName}:`, error);
    return null;
  }
}

/**
 * Subscribe to specific events on a table
 * @param {string} tableName - The table to subscribe to
 * @param {string} event - Event type: 'INSERT' | 'UPDATE' | 'DELETE'
 * @param {function} onUpdate - Callback function for updates
 * @param {string} schema - Schema name (default: 'public')
 * @returns {Object|null} - The channel subscription or null if failed
 */
export function subscribeToTableEvent(tableName, event, onUpdate, schema = 'public') {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase unavailable for subscription');
    return null;
  }

  try {
    const channel = supabase
      .channel(`${tableName}-${event.toLowerCase()}-changes`)
      .on(
        'postgres_changes',
        {
          event: event,         // 'INSERT', 'UPDATE', or 'DELETE'
          schema: schema,
          table: tableName
        },
        (payload) => {
          console.log(`${event} in ${tableName}:`, payload);
          onUpdate(payload);
        }
      )
      .subscribe();

    return channel;
  } catch (error) {
    console.error(`Subscription failed for ${tableName}:`, error);
    return null;
  }
}

/**
 * Unsubscribe from real-time changes
 * @param {Object} channel - The channel subscription to remove
 */
export function unsubscribeFromTable(channel) {
  const supabase = getSupabaseClient();
  if (!supabase || !channel) return;

  try {
    // Supabase JS v2.x uses removeChannel instead of removeSubscription
    supabase.removeChannel(channel);
  } catch (error) {
    console.error('Unsubscribe failed:', error);
  }
}
```

### Advanced Pattern 3: Caching Layer

```javascript
/**
 * Simple cache for query results
 */
class QueryCache {
  constructor(maxAge = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxAge = maxAge;
  }

  generateKey(tableName, filters = {}) {
    return `${tableName}_${JSON.stringify(filters)}`;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  set(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

export const queryCache = new QueryCache();

/**
 * Cached query
 */
async function queryCached(tableName, filters = {}) {
  const key = queryCache.generateKey(tableName, filters);

  // Check cache first
  const cached = queryCache.get(key);
  if (cached) {
    console.log(`Cache hit for ${tableName}`);
    return { data: cached, error: null, fromCache: true };
  }

  // Query database
  const { data, error } = await queryWithFilters(tableName, filters);

  if (!error && data) {
    queryCache.set(key, data);
  }

  return { data, error, fromCache: false };
}
```

### Advanced Pattern 4: Pagination

```javascript
/**
 * Paginated query
 */
async function queryPaginated(tableName, page = 1, pageSize = 10, select = '*') {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, count: 0, error: 'Supabase unavailable' };

  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Get paginated data
    const { data, error, count } = await supabase
      .from(tableName)
      .select(select, { count: 'exact' })
      .range(from, to);

    if (error) throw error;

    return {
      data,
      count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
      error: null
    };
  } catch (error) {
    console.error(`Paginated query failed for ${tableName}:`, error);
    return {
      data: null,
      count: 0,
      error: error.message
    };
  }
}

// Usage
const result = await queryPaginated('users', 1, 20, 'id, name, email');
console.log(`Page 1 of ${result.totalPages}`);
```

---

## Error Handling

### Pattern 1: Try-Catch Wrapper

```javascript
async function safeSupabaseCall(asyncFn) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase plugin not available');
    }

    const result = await asyncFn(supabase);
    return { success: true, data: result };
  } catch (error) {
    console.error('Supabase call failed:', error);
    return {
      success: false,
      error: error.message,
      errorType: error.name
    };
  }
}

// Usage
const result = await safeSupabaseCall(async (supabase) => {
  const { data } = await supabase.from('users').select('*');
  return data;
});
```

### Pattern 2: User-Friendly Error Messages

```javascript
function getErrorMessage(error) {
  if (!error) return null;

  // Map Supabase errors to user-friendly messages
  const errorMap = {
    'PGRST116': 'Record not found',
    '42P01': 'Table not found',
    '23505': 'Duplicate entry',
    '23503': 'Foreign key constraint violation',
    'INVALID_JWT': 'Authentication failed'
  };

  const code = error.code || error.message;
  return errorMap[code] || error.message || 'An error occurred';
}

// Usage
const { data, error } = await supabase.from('users').select('*');
if (error) {
  const userMessage = getErrorMessage(error);
  console.log('Error:', userMessage);
}
```

### Pattern 3: Validation Before Query

```javascript
/**
 * Validate inputs before querying
 */
async function safeQuery(tableName, select = '*') {
  // Validate table name (prevent SQL injection)
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return { data: null, error: 'Invalid table name' };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: 'Supabase unavailable' };
  }

  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(select);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}
```

---

## Best Practices

### 1. Always Check Availability

```javascript
const supabase = getSupabaseClient();
if (!supabase) {
  console.warn('Supabase not available, feature disabled');
  return;
}
```

### 2. Use Composable/Reusable Functions

```javascript
// ❌ BAD - Repeated code
setup() {
  const fetchUsers = async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('users').select('*');
  };

  const fetchPosts = async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('posts').select('*');
  };
}

// ✅ GOOD - Reusable function
setup() {
  const fetchTable = async (table) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.from(table).select('*');
    return data;
  };

  const users = fetchTable('users');
  const posts = fetchTable('posts');
}
```

### 3. Handle Loading and Error States

```javascript
setup() {
  const isLoading = ref(false);
  const error = ref(null);
  const data = ref(null);

  const fetchData = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase unavailable');

      const { data: result, error: err } = await supabase
        .from('items')
        .select('*');

      if (err) throw err;
      data.value = result;
    } catch (err) {
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
  };

  return { isLoading, error, data, fetchData };
}
```

### 4. Use Computed Properties for Derived Data

```javascript
setup() {
  const users = ref([]);

  const activeUsers = computed(() => {
    return users.value.filter(user => user.is_active);
  });

  const userCount = computed(() => {
    return users.value.length;
  });

  return { users, activeUsers, userCount };
}
```

### 5. Limit Query Results

```javascript
// Prevent loading entire tables
const { data } = await supabase
  .from('items')
  .select('*')
  .limit(100); // ✅ Good

// Better: paginate
const { data } = await supabase
  .from('items')
  .select('*')
  .range(0, 19); // ✅ Best - Get first 20 items
```

### 6. Use Indexes for Common Queries

When configuring your Supabase database, add indexes for frequently queried columns:

```sql
-- In Supabase SQL Editor
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_posts_user_id ON posts(user_id);
```

### 7. Handle RLS (Row Level Security)

If your table has RLS enabled, queries will respect user policies:

```javascript
// This will only return rows the user has access to
const { data } = await supabase
  .from('user_data')
  .select('*');
```

---

## Complete Examples

### Example 1: User Management Component

```javascript
<template>
  <div class="user-management">
    <div v-if="isLoading" class="loading">Loading...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="!isLoading && !error">
      <button @click="addUser">Add User</button>

      <div class="user-list">
        <div v-for="user in users" :key="user.id" class="user-item">
          <span>{{ user.name }} ({{ user.email }})</span>
          <button @click="deleteUser(user.id)">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { getSupabaseClient } from './supabaseClient.js';

export default {
  setup() {
    const users = ref([]);
    const isLoading = ref(false);
    const error = ref(null);

    const fetchUsers = async () => {
      isLoading.value = true;
      error.value = null;

      try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase unavailable');

        const { data, error: err } = await supabase
          .from('users')
          .select('id, name, email')
          .order('created_at', { ascending: false });

        if (err) throw err;
        users.value = data || [];
      } catch (err) {
        error.value = err.message;
      } finally {
        isLoading.value = false;
      }
    };

    const addUser = async () => {
      const name = prompt('Enter user name:');
      const email = prompt('Enter user email:');

      if (!name || !email) return;

      try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase unavailable');

        const { error: err } = await supabase
          .from('users')
          .insert([{ name, email }]);

        if (err) throw err;
        await fetchUsers(); // Refresh list
      } catch (err) {
        error.value = err.message;
      }
    };

    const deleteUser = async (userId) => {
      if (!confirm('Delete this user?')) return;

      try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase unavailable');

        const { error: err } = await supabase
          .from('users')
          .delete()
          .eq('id', userId);

        if (err) throw err;
        await fetchUsers(); // Refresh list
      } catch (err) {
        error.value = err.message;
      }
    };

    onMounted(fetchUsers);

    return {
      users,
      isLoading,
      error,
      addUser,
      deleteUser
    };
  }
};
</script>
```

### Example 2: Real-time Data Component

> **Note**: This example uses the Supabase JS v2.x channel-based real-time API.

```javascript
<template>
  <div class="realtime-data">
    <h2>Live Updates</h2>
    <div class="data-list">
      <div v-for="item in items" :key="item.id" class="data-item">
        {{ item.name }} - {{ item.status }}
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import { getSupabaseClient } from './supabaseClient.js';

export default {
  setup() {
    const items = ref([]);
    let channel = null;

    const setupRealtimeListener = () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          console.warn('Supabase unavailable for real-time updates');
          return;
        }

        // Supabase JS v2.x channel-based subscription API
        channel = supabase
          .channel('items-realtime-channel')
          .on(
            'postgres_changes',
            {
              event: '*',           // Listen to INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'items'
            },
            (payload) => {
              console.log('Change received!', payload);

              // In v2.x, the event type is in payload.eventType
              if (payload.eventType === 'INSERT') {
                items.value.push(payload.new);
              } else if (payload.eventType === 'UPDATE') {
                const index = items.value.findIndex(i => i.id === payload.new.id);
                if (index !== -1) {
                  items.value[index] = payload.new;
                }
              } else if (payload.eventType === 'DELETE') {
                items.value = items.value.filter(i => i.id !== payload.old.id);
              }
            }
          )
          .subscribe();

      } catch (error) {
        console.error('Real-time setup failed:', error);
      }
    };

    const fetchInitialData = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { data } = await supabase.from('items').select('*');
        items.value = data || [];
      } catch (error) {
        console.error('Initial fetch failed:', error);
      }
    };

    const cleanup = () => {
      if (channel) {
        const supabase = getSupabaseClient();
        if (supabase) {
          // Supabase JS v2.x uses removeChannel instead of removeSubscription
          supabase.removeChannel(channel);
        }
      }
    };

    onMounted(async () => {
      await fetchInitialData();
      setupRealtimeListener();
    });

    onUnmounted(cleanup);

    return { items };
  }
};
</script>
```

### Example 3: Geographic Data Component (Like the OpenStreetMap)

```javascript
<script>
import { getSupabaseClient } from './supabaseClient.js';

export default {
  setup() {
    const getCountryAtPoint = async (lat, lng) => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          console.warn('Supabase unavailable for geographic queries');
          return null;
        }

        // Call RPC function
        const { data, error } = await supabase
          .schema('gis')
          .rpc('find_country_at_point', {
            point_lat: lat,
            point_lng: lng
          });

        if (error) throw error;
        return data?.[0] || null;

      } catch (error) {
        console.error('Geographic query failed:', error);
        return null;
      }
    };

    const getBoundariesInBbox = async (bounds, zoomLevel = 1) => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return [];

        const { data, error } = await supabase
          .schema('gis')
          .rpc('get_simplified_boundaries_in_bbox', {
            boundary_type: 'countries',
            zoom_level: zoomLevel,
            bbox_west: bounds.west,
            bbox_south: bounds.south,
            bbox_east: bounds.east,
            bbox_north: bounds.north,
            country_filter: null
          });

        if (error) throw error;
        return data || [];

      } catch (error) {
        console.error('Boundary query failed:', error);
        return [];
      }
    };

    return {
      getCountryAtPoint,
      getBoundariesInBbox
    };
  }
};
</script>
```

---

## Troubleshooting

### Plugin Not Found

**Problem**: Getting "Supabase plugin not found" warning

**Solution**:
1. Ensure Supabase plugin is installed in WeWeb
2. Check plugin settings are configured (projectUrl, apiKey)
3. Verify plugin is enabled
4. Check browser console for initialization messages

### Authentication Issues

**Problem**: Getting "Invalid JWT" or "Authentication failed" errors

**Solution**:
1. Verify API key in WeWeb plugin settings
2. Check Row Level Security (RLS) policies on your tables
3. Ensure user has appropriate permissions
4. Check if auth is required for your use case

### Slow Queries

**Problem**: Queries are taking too long

**Solution**:
1. Add indexes to frequently queried columns
2. Use `.limit()` to restrict results
3. Implement pagination instead of fetching all data
4. Use caching layer for repeated queries
5. Check if query has proper filtering conditions

### Real-time Updates Not Working

**Problem**: Real-time subscriptions not updating

**Solution**:
1. Verify Realtime is enabled in Supabase dashboard
2. Check that table has a primary key
3. Ensure Row Level Security allows access
4. Check for unsubscribe in component cleanup

---

## Migration Checklist

Use this checklist when integrating Supabase into a new component:

- [ ] Import `getSupabaseClient` from supabaseClient.js
- [ ] Check Supabase availability before queries
- [ ] Implement error handling with try-catch
- [ ] Add loading and error states
- [ ] Validate input data before sending
- [ ] Implement pagination for large datasets
- [ ] Use caching for frequently accessed data
- [ ] Handle component cleanup (unsubscribe from listeners)
- [ ] Test with Supabase plugin disabled
- [ ] Add console logging for debugging
- [ ] Document required tables and schemas
- [ ] Test with different user roles (if using RLS)

---

## Additional Resources

- [Supabase JS Client Documentation](https://supabase.com/docs/reference/javascript/introduction)
- [WeWeb Plugin Documentation](https://docs.weweb.io/)
- [PostgreSQL RPC Functions](https://supabase.com/docs/guides/database/functions)
- [Row Level Security Setup](https://supabase.com/docs/guides/auth/row-level-security)


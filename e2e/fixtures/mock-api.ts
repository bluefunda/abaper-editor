import { test as base, type Page } from '@playwright/test';

const MOCK_ABAP_SOURCE = `REPORT ztest_program.
DATA: lv_text TYPE string.
lv_text = 'Hello, ABAP!'.
WRITE: / lv_text.`;

const MOCK_FORMATTED_SOURCE = `REPORT ztest_program.

DATA: lv_text TYPE string.

lv_text = 'Hello, ABAP!'.
WRITE: / lv_text.`;

const MOCK_SEARCH_RESULTS = {
  success: true,
  data: {
    Objects: [
      { name: 'ZTEST_PROGRAM', type: 'PROG', description: 'Test Program', package: 'ZTEST', responsible: 'DEVELOPER', created_by: 'DEVELOPER', changed_by: 'DEVELOPER' },
      { name: 'ZCL_TEST_CLASS', type: 'CLAS', description: 'Test Class', package: 'ZTEST', responsible: 'DEVELOPER', created_by: 'DEVELOPER', changed_by: 'DEVELOPER' },
    ],
  },
};

const MOCK_OBJECT = {
  success: true,
  data: {
    object_name: 'ZTEST_PROGRAM',
    object_type: 'PROG',
    source: MOCK_ABAP_SOURCE,
    version: '1',
    etag: 'etag-123',
  },
};

const MOCK_SYNTAX_CHECK_OK = {
  success: true,
  data: {
    object_name: 'ZTEST_PROGRAM',
    object_type: 'PROG',
    messages: [],
  },
};

const MOCK_SYNTAX_CHECK_ERRORS = {
  success: true,
  data: {
    object_name: 'ZTEST_PROGRAM',
    object_type: 'PROG',
    messages: [
      { severity: 'error', text: 'Statement "WRIT" is not valid.', line: 4, column: 1, end_line: 4, end_col: 5, code: 'E001' },
    ],
  },
};

const MOCK_ACTIVATION = {
  success: true,
  data: {
    object_name: 'ZTEST_PROGRAM',
    object_type: 'PROG',
    success: true,
    messages: [],
  },
};

const MOCK_SAVE = { success: true };

const MOCK_FORMAT = {
  success: true,
  data: { source: MOCK_FORMATTED_SOURCE },
};

const MOCK_COMPLETION = {
  success: true,
  data: [
    { identifier: 'CL_ABAP_CONV', kind: 5, insert_text: 'CL_ABAP_CONV' },
    { identifier: 'CL_SALV_TABLE', kind: 5, insert_text: 'CL_SALV_TABLE' },
  ],
};

const MOCK_CONNECT = {
  success: true,
  data: { status: 'connected', authenticated: true },
};

const MOCK_TRANSPORT_INFO = {
  success: true,
  data: {
    local: false,
    package_name: 'ZTEST',
    transports: [
      { transport: 'DEVK900001', description: 'Test transport', owner: 'DEVELOPER', status: 'modifiable' },
    ],
  },
};

async function setupMockRoutes(page: Page) {
  // Block MCP SSE connection
  await page.route('**/mcp/abaper/sse', (route) => route.abort());
  await page.route('**/mcp/abaper/**', (route) => route.abort());

  // Health check
  await page.route('**/health', (route) =>
    route.fulfill({ json: { status: 'ok' } }),
  );

  // System connect
  await page.route('**/api/v1/system/connect', (route) =>
    route.fulfill({ json: MOCK_CONNECT }),
  );

  // Search objects
  await page.route('**/api/v1/objects/search', (route) =>
    route.fulfill({ json: MOCK_SEARCH_RESULTS }),
  );

  // Get object
  await page.route('**/api/v1/objects/get', (route) =>
    route.fulfill({ json: MOCK_OBJECT }),
  );

  // Save object
  await page.route('**/api/v1/objects/create', (route) =>
    route.fulfill({ json: MOCK_SAVE }),
  );

  // Syntax check — default OK, can override per test
  await page.route('**/api/v1/syntax-check', (route) =>
    route.fulfill({ json: MOCK_SYNTAX_CHECK_OK }),
  );

  // Activate
  await page.route('**/api/v1/activate', (route) =>
    route.fulfill({ json: MOCK_ACTIVATION }),
  );

  // Format
  await page.route('**/api/v1/format', (route) =>
    route.fulfill({ json: MOCK_FORMAT }),
  );

  // Completion
  await page.route('**/api/v1/completion', (route) =>
    route.fulfill({ json: MOCK_COMPLETION }),
  );

  // Transport
  await page.route('**/api/v1/transports/info', (route) =>
    route.fulfill({ json: MOCK_TRANSPORT_INFO }),
  );
  await page.route('**/api/v1/transports/create', (route) =>
    route.fulfill({ json: { success: true, data: { transport: 'DEVK900002' } } }),
  );

  // Package contents — respond based on package_name in request body
  await page.route('**/api/v1/packages/contents', async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    const pkg = body?.package_name?.toUpperCase?.() ?? '';
    if (pkg === '$TMP') {
      await route.fulfill({
        json: {
          success: true,
          data: {
            nodes: [
              { name: 'ZCL_TEST_CLASS', type: 'CLAS/OC', description: 'Test Class', expandable: false, uri: '/sap/bc/adt/oo/classes/zcl_test_class' },
              { name: 'ZTEST_PROGRAM', type: 'PROG/P', description: 'Test Program', expandable: false, uri: '/sap/bc/adt/programs/programs/ztest_program' },
            ],
            objectTypes: [{ type: 'CLAS/OC', label: 'Classes' }, { type: 'PROG/P', label: 'Programs' }],
          },
        },
      });
    } else {
      await route.fulfill({
        json: {
          success: true,
          data: {
            nodes: [
              { name: 'ZTEST_PROGRAM', type: 'PROG/P', description: 'Test Program', expandable: false, uri: '' },
            ],
            objectTypes: [{ type: 'PROG/P', label: 'Programs' }],
          },
        },
      });
    }
  });

  // Object list (packages)
  await page.route('**/api/v1/objects/list', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [
          { name: 'ZTEST', type: 'DEVC', description: 'Test Package', package: '', responsible: '', created_by: '', changed_by: '' },
        ],
      },
    }),
  );
}

export const test = base.extend<{ mockApi: void }>({
  mockApi: [async ({ page }, use) => {
    await setupMockRoutes(page);
    await use();
  }, { auto: true }],
});

export { expect } from '@playwright/test';

export {
  MOCK_ABAP_SOURCE,
  MOCK_FORMATTED_SOURCE,
  MOCK_SYNTAX_CHECK_ERRORS,
  MOCK_SYNTAX_CHECK_OK,
};

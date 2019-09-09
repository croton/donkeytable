window.donkeytable = (function ($) {
  function init (selector, dataset, datacolumns, options) {
    const tableSelector = selector;
    const htTable = $(selector);
    let config = {
      responsive: true,
      data: [],
      columns: [],
      columnDefs: [],
      pageLength: 10
    };
    let origTableHeaderColumns = 0;
    let dtapi = null; // Datatables API, initialized after table creation
    configureData(dataset, datacolumns);

    let rowBtns = [];
    let filterFields = {}; // Store column filters by id
    let tableFilters = null; // Store DOM element filter container
    let selectedRowClass = null; // Gets set whenever row selection is enabled
    let selectedRowObserver = null; // A function to be called on row selections
    let selectedRowAutoClear = false; // Set selections to clear whenever selected rows are retrieved

    /* ---------------------- Functions to handle datasets ----------------------*/
    function configureData(dataset, datacolumns) {
      if (!isArrayOk(dataset)) return;
      const [first] = dataset;
      if (typeof first !== 'object') return;
      const fieldNames = isArrayOk(datacolumns) ? datacolumns : Object.keys(first);
      padHtmlTable(fieldNames);
      config.data = dataset;
      config.columns = fieldNames.map(name => { return { data: name }; });
    }

    /* Ensure that there are HTML columns for each data field, optionally hiding any
       new columns added.
    */
    function padHtmlTable(fieldNames, hideAddedColumns = false) {
      const tableHeaderRow = htTable.find('thead tr');
      origTableHeaderColumns = tableHeaderRow.find('th').length;
      const columnsShort = fieldNames.length - origTableHeaderColumns;
      if (columnsShort > 0) { // Add extra HTML columns
        fieldNames.forEach((name, index) => {
          if (index >= origTableHeaderColumns) {
            console.log(`Table ${tableSelector} adding column ${name}.`);
            tableHeaderRow.append(`<th>${name}</th>`);
            if (hideAddedColumns) hideColumnIndex(index);
          }
        });
      }
    }
    /* ------------------------- End Dataset functions --------------------------*/

    function getColumnIndex(name) { return config.columns.findIndex(column => column.data === name); }

    function getColumnByType(name) { return config.columns.find(column => column.fieldType === name); }

    // Get the count of HTML header columns
    function getTableColumns() { return htTable.find('thead th').length; }

    // Add a column to the HTML table
    function addTableColumn(name = '') {
      const tableHeaderRow = htTable.find('thead tr');
      tableHeaderRow.append(`<th>${name}</th>`);
    }

    // Add a non-data column to the config (such as for a button) and ensure there is a corresponding Html column
    function addNonDataColumn() {
      const htmlTableColumns = getTableColumns();
      config.columns.push({data: null});
      const columnsShort = config.columns.length - htmlTableColumns;
      if (columnsShort > 0) {
        for (let i=0; i<columnsShort; i++) { addTableColumn(); }
      }
    }

    function hideColumnIndex(index) {
      config.columnDefs.push({
        'targets': index,
        'visible': false
      });
    }

    /* ----------- Chaining functions which alter the table's config ------------*/
    function pageSize(size) {
      const pageLength = Number(size) || 0;
      if (pageLength > 0) {
        config['pageLength'] = pageLength;
      }
      return this;
    }

    function orderBy(name, direction = 'asc') {
      // Only add ordering if we have data, otherwise Datatable throws error
      if (config.data.length > 0) {
        config['order'] = [[getColumnIndex(name), direction]];
      }
      return this;
    }

    /* Specify more than one column to sort by
     * Example: sortColumns([{name:'colA'}, {name:'colB', sortd:true}, {name:'colC'}]) results in colA-Asc, colB-Desc, colC-Asc
     */
    function sortColumns(columns) {
      if (Array.isArray(columns) && config.data.length > 0) {
        config['order'] = columns.map(col => [getColumnIndex(col.name), (col.sortd ? 'desc' : 'asc')]);
      }
      return this;
    }

    // Hide multiple columns
    function hideColumns(names) {
      const namelist = Array.prototype.slice.call(arguments);
      if (!isArrayOk(namelist)) return this;
      config['columnDefs'].push({
        'targets': namelist.map(name => getColumnIndex(name)),
        'visible': false
      });
      return this;
    }

    // Add a row-level button at the last column; btn={name,className,hdlr}
    function addButton(btn) {
      rowBtns.push(btn);
      addNonDataColumn();
      config['columnDefs'].push({
        'targets': config.columns.length-1,
        'data': null,
        'defaultContent': `<button class="${btn.className}">${btn.name}</button>`,
        'orderable': false
      });
      return this;
    }

    /* Add one or more row-level buttons into the same column, according to an array of button config objects
       btns=[{name,className,hdlr}]
     */
    function addButtons(btns) {
      if (!isArrayOk(btns)) return this;
      rowBtns = btns;
      addNonDataColumn();
      config['columnDefs'].push({
        'targets': config.columns.length-1,
        'data': null,
        'defaultContent': btns.map(btn => `<button class="${btn.className}">${btn.name}</button>`).join(''),
        'orderable': false
      });
      return this;
    }

    function addRowClickHandler(callback) {
      htTable.find('tbody').on('click', 'tr', function () {
        callback(dtapi.row($(this).closest('tr')).data());
      });
      return this;
    }

    function addFilter(columnName, title, choices, defaultChoice, classNames) {
      const index = getColumnIndex(columnName);
      if (index < 0) return this;
      if (Array.isArray(choices)) {
        filterFields[columnName] = {
          html: selectBox(columnName, title, choices, defaultChoice, classNames),
          hdlr: function () { searchDropdown($(this)); },
          defaultChoice: defaultChoice
        };
      }
      return this;
    }

    function enableSelectionByClass(className, callback, clearSelection) {
      selectedRowClass = className;
      selectedRowAutoClear = clearSelection;
      htTable.find('tbody').on('click', 'tr', function () {
        $(this).toggleClass(className);
      });
      if (callback && (typeof callback === 'function')) {
        // listenForRowSelection(callback);
        selectedRowObserver = callback;
      }
      return this;
    }
    /* ----------------- End config-altering chaining functions -----------------*/

    // Create the Datatable instance from the configuration object
    function createTable() {
      if (config.data.length === 0) {
        console.log(`No data for table at ${tableSelector}`);
        // Remove any order directive to avoid Datatables errors
        delete config['order'];
        return this;
      }
      htTable.DataTable(config);
      dtapi = htTable.DataTable();
      const customFilterIds = Object.keys(filterFields);
      if (customFilterIds.length > 0) {
        const fields = customFilterIds.map(key => filterFields[key].html).join('');
        $(tableSelector + '_wrapper .right-filters').append(`<span class="form-group ml-4 pull-right">${fields}</span>`);
        customFilterIds.forEach(key => {
          if (filterFields[key].hdlr) { $(`#${key}`).change(filterFields[key].hdlr); }
          if (filterFields[key].defaultChoice) { $(`#${key}`).trigger('change'); }
        });
      }
      // configureSearchReset();
      if (rowBtns.length > 0) {
        rowBtns.forEach(btn => { activateButton(btn); });
        htTable.on('draw.dt', function () {
          rowBtns.forEach(btn => { activateButton(btn); });
        });
        htTable.on('page.dt', function () {
          rowBtns.forEach(btn => { activateButton(btn); });
        });
      }
      return this;
    }

    // Assign a click handler to a button via a button config object; btn={name,className,hdlr}
    function activateButton(btn) {
      const btnTarget = $(`${tableSelector} tbody button.${btn.className}`);
      if (btn.hdlr) {
        btnTarget.each(function (index, element) {
          $(element).off('click');
          $(element).click(function () {
            // Pass the row data as first parameter to handler function
            btn.hdlr(dtapi.row($(this).closest('tr')).data());
          });
        });
      }
    }

    function filterColumn(columnName, searchTerm) {
      const index = getColumnIndex(columnName);
      if (index < 0) return;
      if (searchTerm) {
        dtapi.column(index).search(`^${searchTerm}$`, true, false).draw();
      } else {
        dtapi.column(index).search('').draw();
      }
    }

    function searchDropdown(jqObject) {
      const index = getColumnIndex(jqObject.prop('id'));
      if (index < 0) return;
      const searchTerm = jqObject.val();
      if (!searchTerm || searchTerm.toUpperCase() === 'ALL') {
        getTable(jqObject).column(index).search('').draw();
      } else { // EXACT match
        getTable(jqObject).column(index).search(`^${searchTerm}$`, true, false).draw();
      }
    }

    function getSelectedData() {
      const rowdata = (selectedRowClass ? getDataByClass(selectedRowClass) : []);
      if (selectedRowAutoClear) { clearSelectedRows(); }
      return rowdata;
    }

    function getDataByClass(className) {
      const selectedRows = dtapi.rows(`.${className}`); // Note: the selector is needed, not just name
      const userEntries = getUserEntries(selectedRows);
      const tabledata = selectedRows.data();
      let rowdata = [];
      if (tabledata.length) {
        // tabledata contains all the properties of the Datatables api PLUS indexed properties from 0 to tabledata.length-1
        if (userEntries) {
          for (let index = 0; index < tabledata.length; index++) {
            let jsondata = tabledata[index];
            jsondata[userEntries.name] = userEntries.data[index];
            rowdata.push(jsondata);
          }
        } else {
          for (let index = 0; index < tabledata.length; index++) { rowdata.push(tabledata[index]); }
        }
      }
      return rowdata;
    }

    function getUserEntries(selectedRows) {
      const userField = getColumnByType('text');
      if (userField) {
        return {
          name: userField.fieldName || 'userField',
          data: getUserTextFieldValues(selectedRows)
        };
      }
      return null;
    }

    function setUserEntries(value, name) {
      if (selectedRowClass) {
        const selectedRows = dtapi.rows(`.${selectedRowClass}`);
        if (selectedRows[0].length > 0) {
          setUserTextFieldValues(selectedRows, value);
        }
      }
    }

    function getUserTextFieldValues(selectedRows) {
      const txtfields = 'input[type="text"]';
      return selectedRows[0].map(index => {
        return Number(dtapi.row(index).nodes().to$().find(txtfields).val());
      });
    }

    function setUserTextFieldValues(selectedRows, value) {
      const txtfields = 'input[type="text"]';
      selectedRows[0].forEach(index => {
        dtapi.row(index).nodes().to$().find(txtfields).val(value);
      });
    }

    function clearSelectedRows() {
      if (selectedRowClass) {
        dtapi.rows(`.${selectedRowClass}`).nodes().to$().removeClass(selectedRowClass);
      }
    }

    function toggleRowSelection() {
      if (selectedRowClass) {
        const selectedRows = dtapi.rows(`.${selectedRowClass}`).nodes();
        if (selectedRows.length === 0) {
          dtapi.rows({ filter: 'applied' }).nodes().to$().addClass(selectedRowClass);
        } else {
          selectedRows.to$().removeClass(selectedRowClass);
        }
      }
    }

    // Use MutationObserver to listen for the table's css class changes
    function listenForRowSelection(callback) {
      const muCfg = { attributes: true, childList: true, subtree: true };
      const targetNode = document.getElementById(tableSelector.substr(1));
      function notifier(mutationsList, observer) {
        for (var mutation of mutationsList) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const classCount = (selectedRowClass ? targetNode.getElementsByClassName(selectedRowClass).length : 0);
            callback((classCount > 0));
          }
        }
      }
      selectedRowObserver = new window.MutationObserver(notifier);
      selectedRowObserver.observe(targetNode, muCfg);
    }

    function clearFilters() {
      if (!tableFilters) {
        tableFilters = getTableFilters();
      }
      if (dtapi && tableFilters) {
        dtapi.search('').columns().search('').draw();
        tableFilters.inputs.val('');
        tableFilters.inputs.trigger('change');
        tableFilters.dropdowns.each(function (index, element) { resetFilter(element.id); });
      }
    }

    // Get the DOM element container for column filters
    function getTableFilters() {
      const elem = $(`${tableSelector}_wrapper .right-filters`);
      return {
        inputs: elem.find('input'),
        dropdowns: elem.find('select')
      };
    }

    // Reset a column filter
    function resetFilter(name) {
      const filterConf = filterFields[name];
      if (filterConf) {
        const filterField = $(`#${name}`);
        filterField.val((filterConf.defaultChoice ? filterConf.defaultChoice : 'All'));
        filterField.trigger('change');
      }
    }

    // Get reference to closest HTML table element to the given jQuery object
    function getTable(jq) {
      return $(jq).closest('.dataTables_wrapper').find('.dataTable').DataTable();
    }

    function destroy() {
      if (dtapi) dtapi.destroy();
      // Remove any dynamically added HTML columns
      htTable.find('thead th').each(function (index, elem) {
        if (index >= origTableHeaderColumns) { $(elem).remove(); }
      });
    }

    // Clear the search box and reset any filters
    function configureSearchReset() {
      const resetButtonHtml = `<button class="btn btn-default btn-sm ml-5 clear-filter"><i class="fa fa-refresh"></i> Reset</button>`;
      const tableGeneralSearch = $(`${tableSelector}_filter`);
      tableGeneralSearch.append(resetButtonHtml);
      if (selectedRowClass) {
        configureRowSelection(tableGeneralSearch);
      }
      const resetSearchBtn = tableGeneralSearch.find('button.clear-filter');
      resetSearchBtn.off('click');
      resetSearchBtn.click(clearFilters);
    }

    function configureRowSelection(container) {
      // Provide a button to select ALL rows in currently filtered set
      const btnId = tableSelector.substr(1) + '_check';
      const selectAllButtonHtml = `<button id="${btnId}" class="btn btn-default btn-sm ml-5" data-toggle="tooltip" title="Select/Deselect"><i class="fa fa-check-square-o"></i></button>`;
      container.append(selectAllButtonHtml);
      $(`#${btnId}`).click(function () { toggleRowSelection(); });
      if (selectedRowObserver) {
        listenForRowSelection(selectedRowObserver);
      }
    }

    // Provide the html of a select element of a given id with a specified array of string options
    function selectBox(id, title, items, defaultItem, classNames) {
      const optionHtml = items.map(item => `<option${(item === defaultItem) ? ' selected' : ''}>${item}</option>`).join('');
      const css = (classNames ? ` ${classNames}` : '');
      return `<label for="${id}">${title}</label>
        <select class="form-control${css}" id="${id}" name="${id}"><option>All</option>${optionHtml}</select>`;
    }

    function isArrayOk(obj) { return (obj && Array.isArray(obj) && obj.length > 0); }

    return {
      createTable: createTable,
      orderBy: orderBy,
      pageSize: pageSize,
      hideColumns: hideColumns,
      addButton: addButton,
      addButtons: addButtons,
      addRowClickHandler: addRowClickHandler,
      addFilter: addFilter,
      clearFilters: clearFilters,
      filterColumn: filterColumn,
      enableSelectionByClass: enableSelectionByClass,
      getSelectedData: getSelectedData,
      setUserEntries: setUserEntries,
      clearSelectedRows: clearSelectedRows,
      destroy: destroy
    };
  }

  return {
    init: init,
    version: '0.1.0'
  };
})(window.jQuery);

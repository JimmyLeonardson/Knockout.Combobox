(function () {
    ko.bindingHandlers.combobox = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var options = ko.utils.extend(defaultOptions, ko.utils.unwrapObservable(valueAccessor()));
            var model = new ko.bindingHandlers.combobox.ViewModel(options);
            ko.renderTemplate(comboboxTemplate, bindingContext.createChildContext(model), { templateEngine: stringTemplateEngine }, element, "replaceChildren");

            return { controlsDescendantBindings: true };
        }
    };

    ko.bindingHandlers.flexibleTemplate = {
        engines: {},
        init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var options = ko.utils.unwrapObservable(valueAccessor());
            var engines = ko.bindingHandlers.flexibleTemplate.engines;
            var engine = engines[options.template];

            var success = false;
            do {
                try {
                    ko.renderTemplate(options.template, bindingContext.createChildContext(options.data), engine, element, "replaceChildren");
                    success = true;
                    engines[options.template] = engine;
                }
                catch (err) {
                    if (engine != null)
                        throw "Template engine not found";

                    engine = { templateEngine: stringTemplateEngine };
                }

            } while (!success)

            return { controlsDescendantBindings: true };
        }
    };

    ko.bindingHandlers.clickedIn = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var target = valueAccessor();
            var clickedIn = false;
            ko.utils.registerEventHandler(document.body, "click", function (e) {
                if (!clickedIn) {
                    target(e.target == element);
                }

                clickedIn = false;
            });

            ko.utils.registerEventHandler(element.parentElement, "click", function (e) {
                clickedIn = true;
            });
        }
    };

    ko.bindingHandlers.keys = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            var target = valueAccessor();
            ko.utils.registerEventHandler(element, "keyup", function (e) {
                target(e.keyCode);
            });
        }
    };

    ko.bindingHandlers.combobox.ViewModel = function (options) {
        this.options = options;
        this.keyPress = ko.observable().extend({ notify: "always" });
        this.keyPress.subscribe(this.onKeyPress, this);
        this.searchText = ko.observable("");
        this.searchText.subscribe(this.onSearch, this);
        this.options.selected.subscribe(this.setSelectedText, this);
        if (this.options.selected() != null) {
            this.setSelectedText(this.options.selected());
        }

        this.dropdownVisible = ko.observable(false);
        this.dropdownItems = ko.observableArray();

        this.paging = new ko.bindingHandlers.combobox.PagingViewModel(options, this.getData.bind(this), this.dropdownItems);
        this.currentActiveIndex = 0;

        this.rowTemplate = options.rowTemplate.replace("$$valueMember&&", options.valueMember);
    };

    ko.bindingHandlers.combobox.ViewModel.prototype = {
        onKeyPress: function (keyCode) {
            switch (keyCode) {
                case 27:
                    this.hideDropdown();
                    break;
                case 13:
                    if (this.dropdownVisible()) {
                        this.selected(this.getCurrentActiveItem());
                    } else {
                        this.forceShow();
                    }
                    break;
                case 38:
                    this.navigate(-1);
                    break;
                case 40:
                    this.navigate(1);
                    break;
            }
        },
        onSearch: function (value, a) {
            if (this.explicitSet) {
                return;
            }

            this.resetDropdown();
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(this.getData.bind(this), 200);
        },
        getData: function (page) {
            var dataSource = ko.utils.unwrapObservable(this.options.dataSource);
            if (typeof dataSource == 'function') {
                dataSource({ text: this.searchText(), page: page ? page : 0, pageSize: this.options.pageSize, total: this.paging.totalCount(), callback: this.getDataCallback.bind(this) });
            } else {
            }
        },
        getDataCallback: function (result) {
            var arr = [];
            ko.utils.arrayForEach(result.data, function (item) {
                arr.push(new ko.bindingHandlers.combobox.ItemViewModel(item));
            } .bind(this));
            this.dropdownItems(arr);
            this.navigate(0);
            this.paging.totalCount(result.total);
            this.dropdownVisible(result.data.length > 0);
        },
        resetDropdown: function () {
            this.currentActiveIndex = 0;
            this.paging.reset();
        },
        selected: function (item) {
            this.options.selected(item.item);
            this.hideDropdown();
        },
        setSelectedText: function (item) {
            this.explicitSet = true;
            this.searchText(ko.utils.unwrapObservable(item[this.options.valueMember]));
            this.explicitSet = false;
        },
        hideDropdown: function () {
            this.dropdownVisible(false);
        },
        showDropdown: function () {
            this.dropdownVisible(true);
        },
        forceShow: function () {
            if (this.paging.itemCount() == 0) {
                this.getData();
            } else {
                this.showDropdown();
            }
        },
        navigate: function (direction) {
            if (this.dropdownVisible() || this.currentActiveIndex == 0) {
                this.inactive(this.getCurrentActiveItem());
                this.currentActiveIndex += direction;
                this.currentActiveIndex = this.currentActiveIndex < 0 ? 0 : this.currentActiveIndex;
                this.currentActiveIndex = this.currentActiveIndex >= this.paging.itemCount() ? this.paging.itemCount() - 1 : this.currentActiveIndex;
                this.active(this.getCurrentActiveItem());
            }
        },
        getCurrentActiveItem: function () {
            return this.dropdownItems()[this.currentActiveIndex];
        },
        active: function (item) {
            item.isActive(true);
        },
        inactive: function (item) {
            item.isActive(false);
        }
    };

    ko.bindingHandlers.combobox.ItemViewModel = function (item) {
        this.item = item;
        this.isActive = ko.observable();
    };

    ko.bindingHandlers.combobox.PagingViewModel = function (options, callback, dropdownItems) {
        this.options = options;
        this.currentPage = ko.observable(0);
        this.totalCount = ko.observable();
        this.totalCount.subscribe(this.update, this);

        this.itemCount = ko.computed(function () {
            return dropdownItems().length;
        }, this);

        this.currentFloor = ko.computed(function () {
            return (this.currentPage() * options.pageSize) + 1;
        }, this);

        this.currentRoof = ko.computed(function () {
            return (this.currentPage() * options.pageSize) + this.itemCount();
        }, this);

        this.pages = ko.observableArray();

        this.show = ko.computed(function () {
            return this.options.paging && this.totalCount() > this.options.pageSize;
        }, this);

        this.callback = callback;
    };

    ko.bindingHandlers.combobox.PagingViewModel.prototype = {
        update: function (count) {
            var current = this.currentPage();
            var pages = [];
            var totalPageCount = Math.ceil(count / this.options.pageSize);
            var maxLinks = Math.min(this.options.pagingLinks, totalPageCount);

            var min = current - (maxLinks / 2);
            var max = current + (maxLinks / 2);

            if (min < 0) {
                max += Math.abs(min);
                min = 0;
            }

            if (max > totalPageCount) {
                min = min - (max - totalPageCount);
                max = totalPageCount;
            }

            for (var i = min; i < max; i++) {
                pages.push(this.createPage(i));
            }

            this.pages(pages);
        },
        createPage: function (index) {
            return {
                name: index + 1,
                index: index,
                isCurrent: ko.computed(function () {
                    return index == this.currentPage()
                }, this)
            };
        },
        pageSelected: function (page) {
            this.currentPage(page.index);
            this.callback(page.index);
            this.update(this.totalCount());
        },
        reset: function () {
            this.currentPage(0);
        }
    };

    //string template source engine
    var stringTemplateSource = function (template) {
        this.template = template;
    };

    stringTemplateSource.prototype.text = function () {
        return this.template;
    };

    var stringTemplateEngine = new ko.nativeTemplateEngine();
    stringTemplateEngine.makeTemplateSource = function (template) {
        return new stringTemplateSource(template);
    };

    //Built in templates
    var comboboxTemplate = '<div data-bind="keys: keyPress">\
        <input placeholder="Placeholder text .." data-bind="value: searchText, valueUpdate: \'afterkeydown\'"></input><button class="btn btn-arrow" data-bind="click: forceShow"><span class="caret"></span></button>\
        <div class="dropdown-menu" data-bind="visible: dropdownVisible, clickedIn: dropdownVisible">\
            <!-- ko foreach: dropdownItems -->\
                <div data-bind="click: $parent.selected.bind($parent), event: { mouseover: $parent.active.bind($parent), mouseout: $parent.inactive.bind($parent) }, css: { active: isActive },  flexibleTemplate: { template: $parent.rowTemplate, data: $data.item }"></div>\
            <!-- /ko -->\
            <div class="nav" data-bind="with: paging">\
                <p class="counter">Showing <span data-bind="text: currentFloor"></span>-<span data-bind="text: currentRoof"></span> of <span data-bind="text: totalCount"></span></p>\
                <div class="pagination"><ul data-bind="visible: show, foreach: pages"><li data-bind="click: $parent.pageSelected.bind($parent), text: name, disable: isCurrent, css: {current: isCurrent}"></li></ul></div>\
            </div>\
        </div>\
    </div>';

    var rowTemplate = '<span data-bind="text: $$valueMember&&"></span>';

    defaultOptions = {
        rowTemplate: rowTemplate,
        valueMember: "name",
        pageSize: 10,
        paging: true,
        pagingLinks: 4
    };
} ());
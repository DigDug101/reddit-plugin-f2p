r.f2p = {
    init: function() {
        this.inventory = new r.f2p.Inventory()
        this.inventoryPanel = new r.f2p.Panel({
            id: 'inventory-panel',
            title: 'inventory',
            content: new r.f2p.InventoryView({
                collection: this.inventory,
            })
        })
        this.inventory.fetch()

        this.gameStatus = new r.f2p.GameStatus()
        this.gameStatus.fetch()
        this.scorePanel = new r.f2p.Panel({
            id: 'score-panel',
            title: 'scoreboard',
            content: new r.f2p.ScoreView({
                model: this.gameStatus
            })
        })

        this.targetOverlay = new r.f2p.TargetOverlay()

        $('body').append(
            this.inventoryPanel.render().el,
            this.scorePanel.render().el,
            this.targetOverlay.render().el
        )

        $('.tagline .author').each(function(idx, el) {
            new r.f2p.HatPile({
                el: el,
                hats: [1, 2, 3, 4, 5, 6, 7, 8, 9]
            }).render()
        })
    }
}

r.f2p.Item = Backbone.Model.extend({
    defaults: {
        "cursor": "crosshair"
    }
})

r.f2p.Inventory = Backbone.Collection.extend({
    url: '#inventory',
    model: r.f2p.Item,

    use: function(item, targetId) {
        $.ajax({
            type: 'post',
            url: '/api/f2p/use_item',
            data: {
                item: item.get('kind'),
                target: targetId
            },
            success: _.bind(function() {
                this.remove(item)
            }, this)
        })
    }
})

r.f2p.GameStatus = Backbone.Model.extend({
    url: '#game_status'
})

r.f2p.Panel = Backbone.View.extend({
    events: {
        'click .title-bar, .minimize-button': 'minimize'
    },

    initialize: function() {
        this.setElement(r.templates.make('f2p/panel', {
            id: this.id,
            title: this.options.title
        }))
        this.storeKey = 'f2p.' + this.id + 'minimized'
        this._minimize(store.get(this.storeKey) == true)
    },

    render: function() {
        this.$('.panel-content').empty().append(
            this.options.content.render().el
        )

        // once content is positioned, set max-height required for css transition.
        _.defer(_.bind(function() {
            this.$('.panel-content').css('max-height', this.options.content.$el.outerHeight())
        }, this))

        return this
    },

    _minimize: function(minimized) {
        store.set(this.storeKey, minimized)
        this.$el.toggleClass('minimized', minimized)
    },

    minimize: function() {
        this._minimize(!this.$el.hasClass('minimized'))
    }
})

r.f2p.InventoryView = Backbone.View.extend({
    className: 'inventory-view',
    tagName: 'ul',

    initialize: function() {
        this._itemViews = {}
        this.bubbleGroup = {}
        this.listenTo(this.collection, 'add', this.addOne)
        this.listenTo(this.collection, 'remove', this.removeOne)
        this.listenTo(this.collection, 'reset', this.addAll)
    },

    addAll: function() {
        this.collection.each(this.addOne, this)
    },

    addOne: function(item) {
        var view = new r.f2p.ItemView({
            model: item,
            bubbleGroup: this.bubbleGroup
        })
        this._itemViews[item.cid] = view
        this.$el.append(view.render().el)
    },

    removeOne: function(item) {
        var view = this._itemViews[item.cid]
        view.remove()
        delete this._itemViews[view.cid]
    }
})

r.f2p.ItemView = Backbone.View.extend({
    tagName: 'li',
    className: 'item',

    events: {
        'click': 'activate'
    },

    initialize: function() {
        this.bubble = new r.f2p.ItemBubble({
            model: this.model,
            parent: this.$el,
            group: this.options.bubbleGroup
        })
    },

    render: function() {
        this.$el.html(
            r.templates.make('f2p/item', this.model.toJSON())
        )
        return this
    },

    activate: function() {
        r.f2p.targetOverlay.displayFor(this.model)
    }
})

r.f2p.ItemBubble = r.ui.Bubble.extend({
    className: 'item-bubble hover-bubble anchor-right',

    showDelay: 0,
    hideDelay: 0,

    render: function() {
        this.$el.html(
            r.templates.make('f2p/item-bubble', this.model.toJSON())
        )
        return this
    }
})

r.f2p.TargetOverlay = Backbone.View.extend({
    id: 'f2p-target-overlay',

    events: {
        'click .shade': 'cancel',
        'click .target-cover': 'select',
    },

    targetKinds: {
        'account': {
            selector: '.tagline .author',
            getId: function(el) {
                return $(el).data('fullname')
            }
        },
        'link': {
            selector: '.thing.link a.title',
            getId: function(el) {
                return $(el).parents('.thing').data('fullname')
            }
        },
        'usertext': {
            selector: '.usertext-body',
            getId: function(el) {
                return $(el).parents('.thing').data('fullname')
            }
        }
    },

    displayFor: function(item) {
        if (this.activeItem != item) {
            this.cancel()
        }

        this.activeItem = item

        var kinds = _.pick(this.targetKinds, item.get('targets')),
            selectors = _.pluck(kinds, 'selector')

        this.$el.html(
            r.templates.make('f2p/target-overlay', {
                selector: _.values(selectors).join(', ')
            })
        )

        $('body').css({'cursor': item.get('cursor')})

        var container = this.$('.target-overlay')
        container.empty()
        _.each(kinds, function(kind, kindName) {
            $(kind.selector).each(function() {
                var $el = $(this),
                    offset = $el.offset(),
                    targetShape = $('<div>')
                        .css({
                            left: offset.left,
                            top: offset.top,
                            width: $el.width(),
                            height: $el.height()
                        })
                        .addClass('target-' + kindName)

                var targetCover = targetShape.clone()
                    .data('target-id', kind.getId($el))

                targetShape.addClass('target-bg')
                targetCover.addClass('target-cover')

                container.append(targetShape, targetCover)
            })
        }, this)

        this.$el.show()
    },

    cancel: function() {
        this.$el.hide()
        this.$el.empty()
        this.activeItem = null
        $('body').css({'cursor': 'auto'})
    },

    select: function(ev) {
        var targetId = $(ev.target).data('target-id')
        r.f2p.inventory.use(this.activeItem, targetId)
        this.cancel()
    }
})

r.f2p.ScoreView = Backbone.View.extend({
    className: 'score-view',

    render: function() {
        this.$el.html(
            r.templates.make('f2p/scores', this.model.toJSON())
        )
        return this
    }
})

r.f2p.HatPile = Backbone.View.extend({
    dims: {
        width: 20,
        height: 7,
        xJitter: 3,
        yJitter: 1,
        rotJitter: 10
    },

    render: function() {
        var pile = $('<div class="hats">'),
            maxLeft = this.$el.width(),
            curRow = 0,
            curLeft = 0

        _.each(this.options.hats, function() {
            var hat = $('<div class="hat">')

            hat.css({
                position: 'absolute',
                left: curLeft,
                bottom: curRow * this.dims.height + _.random(this.dims.yJitter)
            })

            var rotation = _.random(-this.dims.rotJitter / 2, this.dims.rotJitter / 2),
                transform = 'rotate(' + rotation + 'deg)'
            hat.css({
                '-webkit-transform': transform,
                '-moz-transform': transform,
                '-ms-transform': transform,
                'transform': transform
            })

            pile.append(hat)

            curLeft += this.dims.width + _.random(this.dims.xJitter)
            if (curLeft + this.dims.width > maxLeft) {
                curRow += 1
                curLeft = 0
            }
        }, this)

        var targetPos = this.$el.position()
        pile.css({
            position: 'absolute',
            left: targetPos.left
        })
        this.$el.after(pile)
        return this
    }
})

$(function() {
   r.f2p.init()
})

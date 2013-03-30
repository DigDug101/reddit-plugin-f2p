import random
import re

from pylons import c, g

from reddit_f2p import inventory, effects, scores, gamelog

from r2.models import Account, Comment, Link
from r2.models.admintools import send_system_message


ITEMS = {}


def title_to_camel(name):
    # http://stackoverflow.com/a/1176023/9617
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def get_item(item_name):
    item_cls = ITEMS.get(item_name, Item)
    return item_cls(item_name)


def registered_item(cls):
    item_name = title_to_camel(cls.__name__)
    ITEMS[item_name] = cls
    return cls


class Item(object):
    def __init__(self, item_name):
        self.item_name = item_name

    def on_drop(self, user):
        inventory.add_to_inventory(user, self.item_name)

    def on_use(self, user, target):
        effects.add_effect(target, self.item_name)
        log_and_score(user, target, self.item_name, points=1)

    def on_reply(self, user, parent):
        pass


@registered_item
class Abstinence(Item):
    def on_drop(self, user):
        effects.add_effect(user, self.item_name)
        super(Abstinence, self).on_drop(user)

    def on_use(self, user, target):
        effects.remove_effect(user, self.item_name)
        effects.add_effect(target, self.item_name)
        inventory.add_to_inventory(target, self.item_name)
        log_and_score(user, target, self.item_name, damage=1)


class HealingItem(Item):
    def on_use(self, user, target):
        effect_dict = effects.get_all_effects([target._fullname])
        target_afflictions = []
        if isinstance(effect_dict, dict) and target._fullname in effect_dict:
            target_afflictions = effect_dict[target._fullname]

        if target_afflictions:
            to_heal = random.choice(target_afflictions)
            effects.remove_effect(target, to_heal)
            to_heal_title = g.f2pitems[to_heal]['title']
            item_title = g.f2pitems[self.item_name]['title']
            msg = '%s used %s to heal of %s' % (user.name, item_title,
                                                to_heal_title)
        else:
            item_title = g.f2pitems[self.item_name]['title']
            msg = ('%s used %s to heal you but you were '
                   'fully healthy. what a waste' % (user.name, item_title))
        subject = 'you have been healed!'

        if isinstance(target, Account):
            send_system_message(target, subject, msg)

        log_and_score(user, target, self.item_name, points=1)


@registered_item
class Panacea(HealingItem):
    pass


@registered_item
class Melodies(HealingItem):
    pass


def log_and_score(user, target, item, points=1, damage=None):
    scores.incr_score(scores.get_user_team(user), damage or points)
    kw = {'damage': damage} if damage else {'points': points}
    gamelog.GameLogEntry.create(user._fullname, target._fullname, item, **kw)


@registered_item
class Capitulation(Item):
    def on_use(self, user, target):
        damage = 1
        subject = 'you have been poked!'
        item_title = g.f2pitems[self.item_name]['title']
        msg = 'you were poked by %s (with %s) for %s damage' % (user.name,
                                                                item_title,
                                                                damage)
        send_system_message(target, subject, msg)
        log_and_score(user, target, self.item_name, damage=damage)


@registered_item
class Overpowered(Item):
    def on_use(self, user, target):
        effects.clear_effects(target)
        inventory.clear_inventory(target)
        item_title = g.f2pitems[self.item_name]['title']
        subject = 'you were assassinated!'
        msg = ('you were assassinated by %s (with %s) and lost all your items'
               ' items effects' % (user.name, item_title))
        send_system_message(target, subject, msg)
        log_and_score(user, target, self.item_name, damage=1)


@registered_item
class Magnet(Item):
    def on_use(self, user, target):
        target_items = [item_dict['kind']
                        for item_dict in inventory.get_inventory(target)]
        if target_items:
            to_steal = random.choice(target_items)
            inventory.consume_item(target, to_steal)
            inventory.add_to_inventory(user, to_steal)

            to_steal_title = g.f2pitems[to_steal]['title']
            item_title = g.f2pitems[self.item_name]['title']
            subject = "you've been robbed!"
            msg = ('%s used %s to steal your %s' %
                   (user.name, item_title, to_steal_title))
            send_system_message(target, subject, msg)

            subject = "you stole an item"
            msg = ("you used %s to steal %s from %s" %
                   (item_title, to_steal_title, target.name))
            send_system_message(user, subject, msg)
            log_and_score(user, target, self.item_name, points=1)


@registered_item
class Wand(Item):
    def on_use(self, user, target):
        if isinstance(target, Account):
            target_type = 'account'
        elif isinstance(target, Comment):
            target_type = 'usertext'
        elif isinstance(target, Link):
            target_type = 'link'
        else:
            return

        target_items = [item_dict['kind'] for item_dict in g.f2pitems.values()
                        if (item_dict['targets'] and
                            target_type in item_dict['targets'])]
        target_random_item_name = random.choice(target_items)
        target_random_item = get_item(target_random_item_name)
        target_random_item.on_use(user, target)
        log_and_score(user, target, self.item_name, points=1)

        if random.random() > 0.5:
            user_items = [item_dict['kind'] for item_dict in g.f2pitems.values()
                          if (item_dict['targets'] and
                              'account' in item_dict['targets'])]
            user_random_item_name = random.choice(user_items)
            user_random_item = get_item(user_random_item_name)
            user_random_item.on_use(user, user)
        # TODO: messages?
